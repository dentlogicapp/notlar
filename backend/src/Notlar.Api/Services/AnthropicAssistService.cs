using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Notlar.Api.Data;
using Notlar.Api.Entities;

namespace Notlar.Api.Services;

// v19 - Anthropic concrete saglayici (Claude Messages API).
// OpenAI'dan yapisal farklar: POST /v1/messages, x-api-key + anthropic-version header,
// system AYRI parametre (OpenAI'da system bir message), yanit content[0].text.
// Bu yuzden OpenAiUyumluAssistService'i extend ETMEZ; IAiAssistService'i direkt implement eder.
// Reuse: PromptBuilder (prompt + JSON shape ortak). Parse ayni JSON shape (oneriler/skor) uzerinden.
public sealed class AnthropicAssistService : IAiAssistService
{
    private const string ANTHROPIC_VERSION = "2023-06-01";

    private readonly HttpClient _http;
    private readonly AppDbContext _db;
    private readonly IApiKeyKripto _kripto;
    private readonly IMemoryCache _cache;
    private readonly ILogger<AnthropicAssistService> _log;

    public AnthropicAssistService(
        HttpClient http, AppDbContext db, IApiKeyKripto kripto,
        IMemoryCache cache, ILogger<AnthropicAssistService> log)
    {
        _http = http;
        _db = db;
        _kripto = kripto;
        _cache = cache;
        _log = log;
    }

    public string SaglayiciAdi => "anthropic";

    public async Task<bool> SaglikKontrolAsync(CancellationToken ct = default)
    {
        return await _cache.GetOrCreateAsync($"ai_saglik_{SaglayiciAdi}", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(60);
            var ayar = await _db.AiAyarlari.FirstOrDefaultAsync(ct);
            if (ayar is null || !ayar.Aktif) return false;
            try
            {
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                cts.CancelAfter(TimeSpan.FromMilliseconds(5000));
                var req = new HttpRequestMessage(HttpMethod.Get, "https://api.anthropic.com/v1/models");
                AuthEkle(req, ayar);
                var response = await _http.SendAsync(req, cts.Token);
                var saglikli = response.IsSuccessStatusCode;
                await SaglikGuncelleAsync(ayar, saglikli, ct);
                return saglikli;
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "AI saglik kontrolu basarisiz: {Saglayici}", SaglayiciAdi);
                await SaglikGuncelleAsync(ayar, false, ct);
                return false;
            }
        });
    }

    public async Task<TaslakSonucu> TaslakOnerAsync(string anahtar, AiTaslakBaglam baglam, CancellationToken ct = default)
    {
        var ayar = await AyarGetirAsync(ct);
        var basla = Stopwatch.GetTimestamp();
        var text = await MesajGonderAsync(PromptBuilder.SystemMesaji(), PromptBuilder.TaslakOner(anahtar, baglam), 500, 0.7, ayar, ct);
        var oneriler = ParseOnerileri(text);
        var sureMs = (long)Stopwatch.GetElapsedTime(basla).TotalMilliseconds;
        return new TaslakSonucu(oneriler, SaglayiciAdi, ayar.ModelId, sureMs);
    }

    public async Task<TaslakSonucu> YenidenYazAsync(string mevcut, AiYenidenYazModu modu, CancellationToken ct = default)
    {
        var ayar = await AyarGetirAsync(ct);
        var basla = Stopwatch.GetTimestamp();
        var text = await MesajGonderAsync(PromptBuilder.SystemMesaji(), PromptBuilder.YenidenYaz(mevcut, modu), 500, 0.7, ayar, ct);
        var oneriler = ParseOnerileri(text);
        var sureMs = (long)Stopwatch.GetElapsedTime(basla).TotalMilliseconds;
        return new TaslakSonucu(oneriler, SaglayiciAdi, ayar.ModelId, sureMs);
    }

    public async Task<AiTutarlilikRaporu> TutarlilikKontrolAsync(Guid isletmeId, CancellationToken ct = default)
    {
        var ayar = await AyarGetirAsync(ct);
        var text = await MesajGonderAsync(
            "Sen Türkçe marka tutarlilik denetcisisin. Yanitini gecerli JSON ver.",
            PromptBuilder.TutarlilikKontrol("(tenant metinleri v18 Asama 5'te baglanacak)"),
            800, 0.3, ayar, ct);
        return ParseTutarlilik(text);
    }

    // v19 - Serbest prompt ile mail metni uretimi (Inline AI Compose). Duz metin doner, parse YOK.
    public async Task<string> SerbestUretAsync(SerbestUretBaglam baglam, CancellationToken ct = default)
    {
        var ayar = await AyarGetirAsync(ct);
        var maxTokens = baglam.Tip == "subject" ? 120 : 1000;
        var text = await MesajGonderAsync(PromptBuilder.SerbestUretSistem(), PromptBuilder.SerbestUret(baglam), maxTokens, 0.8, ayar, ct);
        return text.Trim();
    }

    // --- helper ---

    private async Task<AiAyari> AyarGetirAsync(CancellationToken ct)
    {
        var ayar = await _db.AiAyarlari.FirstOrDefaultAsync(ct);
        if (ayar is null) throw new AiKullanilamazException("AI_LLM_KAPALI", "AI ayari bulunamadi.");
        if (!ayar.Aktif) throw new AiKullanilamazException("AI_LLM_KAPALI");
        return ayar;
    }

    private void AuthEkle(HttpRequestMessage req, AiAyari ayar)
    {
        if (string.IsNullOrEmpty(ayar.ApiKeyEncrypted))
            throw new AiKullanilamazException("AI_API_KEY_ZORUNLU", "Anthropic icin API key zorunlu.");
        var apiKey = _kripto.Coz(ayar.ApiKeyEncrypted);
        req.Headers.Add("x-api-key", apiKey);
        req.Headers.Add("anthropic-version", ANTHROPIC_VERSION);
    }

    // Claude Messages API cagrisi -> content[0].text (temizlenmis JSON string).
    private async Task<string> MesajGonderAsync(string sistem, string kullanici, int maxTokens, double temperature, AiAyari ayar, CancellationToken ct)
    {
        var body = new
        {
            model = ayar.ModelId,
            max_tokens = maxTokens,
            temperature,
            system = sistem,
            messages = new[] { new { role = "user", content = kullanici } }
        };

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(ayar.TimeoutMs);
        HttpResponseMessage response;
        try
        {
            var req = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages")
            {
                Content = JsonContent.Create(body)
            };
            AuthEkle(req, ayar);
            response = await _http.SendAsync(req, cts.Token);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new AiKullanilamazException("AI_LLM_TIMEOUT");
        }
        catch (HttpRequestException ex)
        {
            _log.LogWarning(ex, "AI baglanti hatasi: {Saglayici}", SaglayiciAdi);
            throw new AiKullanilamazException("AI_BAGLANTI_HATASI");
        }

        HataKontrolEt(response);
        var json = await response.Content.ReadAsStringAsync(ct);
        return IcerikCek(json);
    }

    // Anthropic Messages yaniti -> content[0].text. Model bazen ```json sarmalar -> temizle.
    private static string IcerikCek(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var text = doc.RootElement.GetProperty("content")[0].GetProperty("text").GetString() ?? "{}";
        text = text.Trim();
        if (text.StartsWith("```"))
        {
            var ilkSatirSonu = text.IndexOf('\n');
            if (ilkSatirSonu >= 0) text = text[(ilkSatirSonu + 1)..];
            if (text.EndsWith("```")) text = text[..^3];
            text = text.Trim();
        }
        return text;
    }

    private List<string> ParseOnerileri(string icerik)
    {
        try
        {
            using var ic = JsonDocument.Parse(icerik);
            var liste = new List<string>();
            foreach (var o in ic.RootElement.GetProperty("oneriler").EnumerateArray())
                liste.Add(o.GetString() ?? "");
            return liste;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "AI oneri parse hatasi");
            throw new AiKullanilamazException("AI_PARSING_HATASI");
        }
    }

    private AiTutarlilikRaporu ParseTutarlilik(string icerik)
    {
        try
        {
            using var ic = JsonDocument.Parse(icerik);
            var root = ic.RootElement;
            var skor = root.TryGetProperty("skor", out var s) ? s.GetDouble() : 0d;
            var tutarli = root.TryGetProperty("tutarli", out var t) && t.GetBoolean();
            var sorunlar = new List<AiTutarsizlik>();
            if (root.TryGetProperty("sorunlar", out var sr) && sr.ValueKind == JsonValueKind.Array)
                foreach (var x in sr.EnumerateArray())
                    sorunlar.Add(new AiTutarsizlik(
                        x.TryGetProperty("anahtar", out var a) ? a.GetString() ?? "" : "",
                        x.TryGetProperty("mevcut", out var m) ? m.GetString() ?? "" : "",
                        x.TryGetProperty("sorun", out var so) ? so.GetString() ?? "" : "",
                        x.TryGetProperty("oneri", out var on) ? on.GetString() ?? "" : ""));
            return new AiTutarlilikRaporu(skor, tutarli, sorunlar);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "AI tutarlilik parse hatasi");
            throw new AiKullanilamazException("AI_PARSING_HATASI");
        }
    }

    // HTTP status -> Turkce hata kodu (mevcut sozlukle uyumlu). await yok -> void (CS1998 onleme).
    private void HataKontrolEt(HttpResponseMessage response)
    {
        if (response.IsSuccessStatusCode) return;
        var kod = (int)response.StatusCode switch
        {
            429 => "AI_RATE_LIMIT",
            _ => "AI_BAGLANTI_HATASI"
        };
        _log.LogWarning("AI hata: HTTP {Status} -> {Kod}", (int)response.StatusCode, kod);
        throw new AiKullanilamazException(kod);
    }

    private async Task SaglikGuncelleAsync(AiAyari ayar, bool saglikli, CancellationToken ct)
    {
        ayar.SonSaglikDurum = saglikli;
        ayar.SonSaglikKontrol = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(ct);
    }
}
