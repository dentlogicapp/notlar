using System.Diagnostics;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Notlar.Api.Data;
using Notlar.Api.Entities;

namespace Notlar.Api.Services;

/// <summary>
/// v17 - AI metin yardimcisi sozlesmesi (Strategy Pattern).
/// G.3: donus TaslakSonucu (telemetri), ModelId interface property degil.
/// </summary>
public interface IAiAssistService
{
    string SaglayiciAdi { get; }
    Task<bool> SaglikKontrolAsync(CancellationToken ct = default);
    Task<TaslakSonucu> TaslakOnerAsync(string anahtar, AiTaslakBaglam baglam, CancellationToken ct = default);
    Task<TaslakSonucu> YenidenYazAsync(string mevcut, AiYenidenYazModu modu, CancellationToken ct = default);
    Task<AiTutarlilikRaporu> TutarlilikKontrolAsync(Guid isletmeId, CancellationToken ct = default);
}

/// <summary>
/// v17 - OpenAI uyumlu (chat completions) saglayicilar icin abstract base.
/// Senaryo A: ai_ayarlari dogrudan AppDbContext'ten okunur (repository yok).
/// </summary>
public abstract class OpenAiUyumluAssistService : IAiAssistService
{
    protected readonly HttpClient _http;
    protected readonly AppDbContext _db;
    protected readonly IApiKeyKripto _kripto;
    protected readonly IMemoryCache _cache;
    protected readonly ILogger _log;

    protected OpenAiUyumluAssistService(
        HttpClient http, AppDbContext db, IApiKeyKripto kripto,
        IMemoryCache cache, ILogger log)
    {
        _http = http;
        _db = db;
        _kripto = kripto;
        _cache = cache;
        _log = log;
    }

    public abstract string SaglayiciAdi { get; }

    protected abstract string BaseUrlBelirle(AiAyari ayar);
    protected abstract HttpRequestMessage RequestHazirla(HttpMethod method, string path, object? body, AiAyari ayar);

    // ai_ayarlari singleton oku (tek satir). Yoksa AI kapali say.
    protected async Task<AiAyari> AyarGetirAsync(CancellationToken ct)
    {
        var ayar = await _db.AiAyarlari.FirstOrDefaultAsync(ct);
        if (ayar is null)
            throw new AiKullanilamazException("AI_LLM_KAPALI", "AI ayari bulunamadi.");
        return ayar;
    }

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
                var req = RequestHazirla(HttpMethod.Get, "/models", null, ayar);
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

    private async Task SaglikGuncelleAsync(AiAyari ayar, bool saglikli, CancellationToken ct)
    {
        ayar.SonSaglikDurum = saglikli;
        ayar.SonSaglikKontrol = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(ct);
    }

    public async Task<TaslakSonucu> TaslakOnerAsync(string anahtar, AiTaslakBaglam baglam, CancellationToken ct = default)
    {
        var ayar = await AyarGetirAsync(ct);
        if (!ayar.Aktif) throw new AiKullanilamazException("AI_LLM_KAPALI");

        var body = new
        {
            model = ayar.ModelId,
            messages = new[]
            {
                new { role = "system", content = PromptBuilder.SystemMesaji() },
                new { role = "user", content = PromptBuilder.TaslakOner(anahtar, baglam) }
            },
            temperature = 0.7,
            max_tokens = 500,
            response_format = new { type = "json_object" }
        };
        var oneriler = await IsteVeOnerileriParseEt(body, ayar, ct);
        return oneriler;
    }

    public async Task<TaslakSonucu> YenidenYazAsync(string mevcut, AiYenidenYazModu modu, CancellationToken ct = default)
    {
        var ayar = await AyarGetirAsync(ct);
        if (!ayar.Aktif) throw new AiKullanilamazException("AI_LLM_KAPALI");

        var body = new
        {
            model = ayar.ModelId,
            messages = new[]
            {
                new { role = "system", content = PromptBuilder.SystemMesaji() },
                new { role = "user", content = PromptBuilder.YenidenYaz(mevcut, modu) }
            },
            temperature = 0.7,
            max_tokens = 500,
            response_format = new { type = "json_object" }
        };
        return await IsteVeOnerileriParseEt(body, ayar, ct);
    }

    public async Task<AiTutarlilikRaporu> TutarlilikKontrolAsync(Guid isletmeId, CancellationToken ct = default)
    {
        var ayar = await AyarGetirAsync(ct);
        if (!ayar.Aktif) throw new AiKullanilamazException("AI_LLM_KAPALI");

        // NOT: tenant metinleri v18'de isletme_metinleri'nden toplanacak; v17 altyapida placeholder baglam.
        var body = new
        {
            model = ayar.ModelId,
            messages = new[]
            {
                new { role = "system", content = "Sen Türkçe marka tutarlilik denetcisisin. Yanitini gecerli JSON ver." },
                new { role = "user", content = PromptBuilder.TutarlilikKontrol("(tenant metinleri v18 Asama 5'te baglanacak)") }
            },
            temperature = 0.3,
            max_tokens = 800,
            response_format = new { type = "json_object" }
        };

        var json = await IsteVeHamYanitAl(body, ayar, ct);
        return ParseTutarlilik(json);
    }

    // Ortak: istek gonder + oneri listesini parse et + telemetri (taslak/yeniden-yaz)
    private async Task<TaslakSonucu> IsteVeOnerileriParseEt(object body, AiAyari ayar, CancellationToken ct)
    {
        var basla = Stopwatch.GetTimestamp();
        var json = await IsteVeHamYanitAl(body, ayar, ct);
        var oneriler = ParseOnerileri(json);
        var sureMs = (long)Stopwatch.GetElapsedTime(basla).TotalMilliseconds;
        return new TaslakSonucu(oneriler, SaglayiciAdi, ayar.ModelId, sureMs);
    }

    // Ortak: chat/completions POST + ham yanit string (timeout/baglanti hatalari -> AI_* kod)
    private async Task<string> IsteVeHamYanitAl(object body, AiAyari ayar, CancellationToken ct)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(ayar.TimeoutMs);
        HttpResponseMessage response;
        try
        {
            var req = RequestHazirla(HttpMethod.Post, "/chat/completions", body, ayar);
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

        await HataKontrolEt(response);
        return await response.Content.ReadAsStringAsync(ct);
    }

    // HTTP status -> Turkce hata kodu (spec 6.7)
    protected async Task HataKontrolEt(HttpResponseMessage response)
    {
        if (response.IsSuccessStatusCode) return;
        var govde = await response.Content.ReadAsStringAsync();
        var kod = (int)response.StatusCode switch
        {
            401 or 403 => "AI_API_KEY_GECERSIZ",
            404 => "AI_MODEL_BULUNAMADI",
            429 => govde.Contains("quota", StringComparison.OrdinalIgnoreCase)
                       || govde.Contains("insufficient", StringComparison.OrdinalIgnoreCase)
                   ? "AI_KOTA_ASILDI" : "AI_RATE_LIMIT",
            _ => "AI_BAGLANTI_HATASI"
        };
        _log.LogWarning("AI hata: HTTP {Status} -> {Kod}", (int)response.StatusCode, kod);
        throw new AiKullanilamazException(kod);
    }

    // OpenAI chat yaniti -> icerik JSON -> oneriler listesi ({"oneriler": [...]})
    protected List<string> ParseOnerileri(string json)
    {
        try
        {
            var icerik = IcerikCek(json);
            using var ic = JsonDocument.Parse(icerik);
            var liste = new List<string>();
            foreach (var o in ic.RootElement.GetProperty("oneriler").EnumerateArray())
                liste.Add(o.GetString() ?? "");
            return liste;
        }
        catch (AiKullanilamazException) { throw; }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "AI oneri parse hatasi");
            throw new AiKullanilamazException("AI_PARSING_HATASI");
        }
    }

    protected AiTutarlilikRaporu ParseTutarlilik(string json)
    {
        try
        {
            var icerik = IcerikCek(json);
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

    // OpenAI zarfindan choices[0].message.content cek
    private static string IcerikCek(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content").GetString() ?? "{}";
    }
}

/// <summary>
/// v17 - OpenAI concrete saglayici (default). Model ai_ayarlari.ModelId'den (orn. gpt-4o-mini).
/// </summary>
public sealed class OpenAiAssistService : OpenAiUyumluAssistService
{
    public OpenAiAssistService(
        HttpClient http, AppDbContext db, IApiKeyKripto kripto,
        IMemoryCache cache, ILogger<OpenAiAssistService> log)
        : base(http, db, kripto, cache, log) { }

    public override string SaglayiciAdi => "openai";

    protected override string BaseUrlBelirle(AiAyari ayar) => "https://api.openai.com/v1";

    protected override HttpRequestMessage RequestHazirla(HttpMethod method, string path, object? body, AiAyari ayar)
    {
        var req = new HttpRequestMessage(method, $"{BaseUrlBelirle(ayar)}{path}");
        if (!string.IsNullOrEmpty(ayar.ApiKeyEncrypted))
        {
            var apiKey = _kripto.Coz(ayar.ApiKeyEncrypted);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        }
        if (body is not null)
            req.Content = JsonContent.Create(body);
        return req;
    }
}