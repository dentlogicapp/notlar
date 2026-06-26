using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using Notlar.Api.Models;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

// v18 Asama 11/12 - AI taslak oneri endpoint'leri. v17 AI altyapisini (IAiAssistServiceFactory +
// IAiAssistService.TaslakOnerAsync) kullanir; paralel yapi YOK. Saglayicidan habersiz (OpenAI/lokal fark etmez).
public static class AiAssistEndpoints
{
    // v19 - AI serbest uretim YALNIZ bu 3 alanda acik (super admin karari; maliyet + kapsam koruma).
    private static readonly HashSet<string> AiIzinliAnahtarlar = new()
    {
        "mail_davetiye_giris_metni",     // Davet Maili Giris Metni
        "mail_davetiye_rehber",          // Davet Maili Rehber Icerigi
        "dashboard_karsilama_alt_metin", // Dashboard Karsilama Alt Metni
    };

    public static void MapAiAssistEndpoints(this WebApplication app)
    {
        // v18 Asama 11.5 - AI sadece super admin (maliyet kontrolu). Tenant erisimi yok (RequireSuperAdmin -> 403).
        var g = app.MapGroup("/api/super-admin/ai-assist").WithTags("SuperAdmin").RequireAuthorization().RequireSuperAdmin();

        // Saglik - AI buton aktif/pasif (60sn cache servis icinde). Hata da olsa false doner (buton gri).
        g.MapGet("/saglik", async (IAiAssistServiceFactory factory, CancellationToken ct) =>
        {
            try
            {
                var servis = await factory.ServisGetirAsync(ct);
                var saglikli = await servis.SaglikKontrolAsync(ct);
                return Results.Ok(new { saglikli });
            }
            catch
            {
                return Results.Ok(new { saglikli = false });
            }
        });

        // Taslak oner - anahtar + ton/uzunluk baglami -> 3 oneri (TaslakSonucu).
        g.MapPost("/taslak-oner", async (TaslakOnerIstegi req, AppDbContext db, IUserContext uc,
            IAiAssistServiceFactory factory, IIsletmeMetinService metinSvc, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tid = uc.AktifIsletmeId.Value;

            var katalog = await db.MetinAnahtarlari
                .FirstOrDefaultAsync(a => a.Anahtar == req.Anahtar && !a.Deprecated, ct);
            if (katalog is null)
                return Results.NotFound(new { hata = "ANAHTAR_BULUNAMADI", mesaj = "Metin anahtari bulunamadi." });

            // Tenant metinleri: marka adi + tutarlilik baglami (dolu diger metinler)
            var metinler = await metinSvc.TumunuGetirAsync(tid, ct);
            var map = metinler.ToDictionary(m => m.Anahtar, m => m.Icerik);
            var markaAdi = map.GetValueOrDefault("marka_adi") ?? "";
            var digerMetinler = metinler
                .Where(m => m.Anahtar != req.Anahtar && !string.IsNullOrWhiteSpace(m.Icerik))
                .Select(m => $"{m.Anahtar}: {m.Icerik}")
                .Take(8).ToList();

            var baglam = new AiTaslakBaglam(
                katalog.Etiket,
                katalog.Aciklama,
                PlaceholderListesi(katalog.DesteklenenPlaceholderlar),
                markaAdi,
                req.EtkinlikTanimi,
                string.IsNullOrWhiteSpace(req.Ton) ? "samimi" : req.Ton,
                req.Uzunluk,
                digerMetinler);

            try
            {
                var servis = await factory.ServisGetirAsync(ct);
                var sonuc = await servis.TaslakOnerAsync(req.Anahtar, baglam, ct);
                return Results.Ok(sonuc);
            }
            catch (AiKullanilamazException ex)
            {
                return Results.Json(new { hata = ex.Kod, mesaj = "AI su an kullanilamiyor." }, statusCode: 503);
            }
        });

        // v18 Asama 11.6 - Dokumantasyon oner: super admin metin-anahtari formunda Yonlendirme/Aciklama
        // alanlari icin oneri. Tenant/DB lookup YOK (yeni anahtar olabilir); form verisi kullanilir.
        g.MapPost("/dokumantasyon-oner", async (DokumantasyonOnerIstegi req,
            IAiAssistServiceFactory factory, CancellationToken ct) =>
        {
            var baglam = new AiTaslakBaglam(
                string.IsNullOrWhiteSpace(req.Etiket) ? req.AnahtarKodu : req.Etiket!,
                null, Array.Empty<string>(), "(sistem dokumantasyonu)", null,
                "acik ve yonlendirici", null, null,
                Mod: "dokumantasyon", Tip: req.Tip, Kategori: req.Kategori, HedefAlan: req.HedefAlan);

            try
            {
                var servis = await factory.ServisGetirAsync(ct);
                var sonuc = await servis.TaslakOnerAsync(req.AnahtarKodu, baglam, ct);
                return Results.Ok(sonuc);
            }
            catch (AiKullanilamazException ex)
            {
                return Results.Json(new { hata = ex.Kod, mesaj = "AI su an kullanilamiyor." }, statusCode: 503);
            }
        });

        // v19 - Serbest prompt ile mail metni uretimi (Inline AI Compose). Cikti duz metin (tek oneri).
        g.MapPost("/serbest-uret", async (SerbestUretIstegi req, AppDbContext db, IUserContext uc,
            IAiAssistServiceFactory factory, IIsletmeMetinService metinSvc, IAuditService audit, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tid = uc.AktifIsletmeId.Value;

            if (string.IsNullOrWhiteSpace(req.Prompt))
                return Results.BadRequest(new { hata = "PROMPT_ZORUNLU", mesaj = "Prompt bos olamaz." });

            var katalog = await db.MetinAnahtarlari
                .FirstOrDefaultAsync(a => a.Anahtar == req.Anahtar && !a.Deprecated, ct);
            if (katalog is null)
                return Results.NotFound(new { hata = "ANAHTAR_BULUNAMADI", mesaj = "Metin anahtari bulunamadi." });

            // Defense in depth: serbest uretim YALNIZ izinli 3 alanda (maliyet + kapsam koruma).
            // Frontend butonu zaten sadece bu alanlarda gosterir; bu backend ikinci kale.
            if (!AiIzinliAnahtarlar.Contains(req.Anahtar))
                return Results.Json(new { hata = "ALAN_DESTEKLENMIYOR", mesaj = "Bu alanda AI metin uretimi kullanilamaz." }, statusCode: 403);

            var metinler = await metinSvc.TumunuGetirAsync(tid, ct);
            var markaAdi = metinler.FirstOrDefault(m => m.Anahtar == "marka_adi")?.Icerik ?? "";
            var digerMetinler = metinler
                .Where(m => !string.IsNullOrWhiteSpace(m.Icerik) && m.Anahtar != "marka_adi" && m.Anahtar != katalog.Anahtar)
                .Select(m => m.Icerik!.Length > 180 ? m.Icerik![..180] + "..." : m.Icerik!)
                .Take(12)
                .ToList();

            var baglam = new SerbestUretBaglam(
                req.Prompt,
                katalog.Anahtar,
                katalog.Etiket,
                katalog.Yonlendirme,
                katalog.Tip,
                markaAdi,
                req.MevcutMetin,
                req.Ton,
                req.Uzunluk,
                digerMetinler);

            try
            {
                var basla = Stopwatch.GetTimestamp();
                var servis = await factory.ServisGetirAsync(ct);
                var metin = await servis.SerbestUretAsync(baglam, ct);
                var sure = (long)Stopwatch.GetElapsedTime(basla).TotalMilliseconds;
                // Telemetri: append-only denetim_gunlukleri (Bolum 3 - ayri tablo yok). Token tahmini ~karakter/4.
                await audit.YazAsync("ai_serbest_uretildi", "ai_telemetri", null,
                    degisenAlanlar: JsonSerializer.Serialize(new
                    {
                        saglayici = servis.SaglayiciAdi,
                        anahtar = req.Anahtar,
                        tokenTahmini = (metin?.Length ?? 0) / 4,
                        sureMs = sure
                    }), ct: ct);
                return Results.Ok(new { metin });
            }
            catch (AiKullanilamazException ex)
            {
                return Results.Json(new { hata = ex.Kod, mesaj = "AI su an kullanilamiyor." }, statusCode: 503);
            }
        });

        // v19 - Serbest uretim STREAMING (SSE). Token token "data: <json-string>" akar, sonda "data: [DONE]".
        // Non-streaming /serbest-uret korunur (fallback). Ayni whitelist + tenant baglam.
        g.MapPost("/serbest-uret-akis", async (SerbestUretIstegi req, HttpContext http, AppDbContext db, IUserContext uc,
            IAiAssistServiceFactory factory, IIsletmeMetinService metinSvc, IAuditService audit, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) { http.Response.StatusCode = 401; return; }
            var tid = uc.AktifIsletmeId.Value;

            if (string.IsNullOrWhiteSpace(req.Prompt) || !AiIzinliAnahtarlar.Contains(req.Anahtar))
            {
                http.Response.StatusCode = 400;
                return;
            }

            var katalog = await db.MetinAnahtarlari.FirstOrDefaultAsync(a => a.Anahtar == req.Anahtar && !a.Deprecated, ct);
            if (katalog is null) { http.Response.StatusCode = 404; return; }

            var metinler = await metinSvc.TumunuGetirAsync(tid, ct);
            var markaAdi = metinler.FirstOrDefault(m => m.Anahtar == "marka_adi")?.Icerik ?? "";
            var digerMetinler = metinler
                .Where(m => !string.IsNullOrWhiteSpace(m.Icerik) && m.Anahtar != "marka_adi" && m.Anahtar != katalog.Anahtar)
                .Select(m => m.Icerik!.Length > 180 ? m.Icerik![..180] + "..." : m.Icerik!)
                .Take(12)
                .ToList();

            var baglam = new SerbestUretBaglam(
                req.Prompt, katalog.Anahtar, katalog.Etiket, katalog.Yonlendirme,
                katalog.Tip, markaAdi, req.MevcutMetin, req.Ton, req.Uzunluk, digerMetinler);

            http.Response.Headers.Append("Content-Type", "text/event-stream");
            http.Response.Headers.Append("Cache-Control", "no-cache");
            http.Response.Headers.Append("X-Accel-Buffering", "no"); // nginx ara belleklemesini kapat

            try
            {
                var basla = Stopwatch.GetTimestamp();
                var sb = new StringBuilder();
                var servis = await factory.ServisGetirAsync(ct);
                await foreach (var token in servis.SerbestUretAkisAsync(baglam, ct))
                {
                    sb.Append(token);
                    await http.Response.WriteAsync($"data: {JsonSerializer.Serialize(token)}\n\n", ct);
                    await http.Response.Body.FlushAsync(ct);
                }
                await http.Response.WriteAsync("data: [DONE]\n\n", ct);
                var sure = (long)Stopwatch.GetElapsedTime(basla).TotalMilliseconds;
                // Telemetri: streaming basariyla tamamlandiysa yaz (kismi/hatali akis sayilmaz). Token ~karakter/4.
                await audit.YazAsync("ai_serbest_uretildi", "ai_telemetri", null,
                    degisenAlanlar: JsonSerializer.Serialize(new
                    {
                        saglayici = servis.SaglayiciAdi,
                        anahtar = req.Anahtar,
                        tokenTahmini = sb.Length / 4,
                        sureMs = sure
                    }), ct: ct);
            }
            catch (AiKullanilamazException ex)
            {
                await http.Response.WriteAsync($"event: hata\ndata: {JsonSerializer.Serialize(new { hata = ex.Kod })}\n\n", ct);
            }
            await http.Response.Body.FlushAsync(ct);
        });

        // v19 - AI kullanim/maliyet sayaci (bu ay). Telemetri append-only denetim_gunluklerinden okunur (Bolum 3).
        g.MapGet("/kullanim", async (AppDbContext db, CancellationToken ct) =>
        {
            var simdi = DateTimeOffset.UtcNow;
            var ayBasi = new DateTimeOffset(simdi.Year, simdi.Month, 1, 0, 0, 0, TimeSpan.Zero);
            var kayitlar = await db.DenetimGunlukleri
                .Where(d => d.Olay == "ai_serbest_uretildi" && d.Zaman >= ayBasi)
                .Select(d => d.DegisenAlanlar)
                .ToListAsync(ct);
            long token = 0;
            foreach (var j in kayitlar)
            {
                if (string.IsNullOrWhiteSpace(j)) continue;
                try
                {
                    using var doc = JsonDocument.Parse(j);
                    if (doc.RootElement.TryGetProperty("tokenTahmini", out var t) && t.TryGetInt64(out var tv))
                        token += tv;
                }
                catch { /* bozuk JSON telemetriyi atla, sayim devam */ }
            }
            return Results.Ok(new { buAyCagri = kayitlar.Count, buAyTokenTahmini = token });
        });
    }

    private static IReadOnlyList<string> PlaceholderListesi(string jsonb)
    {
        try { return JsonSerializer.Deserialize<List<string>>(jsonb) ?? new List<string>(); }
        catch { return new List<string>(); }
    }
}

// Body: anahtar + ton/uzunluk/etkinlik baglami (katalog + tenant verisi backend'de doldurulur).
public sealed record TaslakOnerIstegi(string Anahtar, string? Ton, string? Uzunluk, string? EtkinlikTanimi);

// v18 Asama 11.6 - Dokumantasyon oner istegi (super admin metin-anahtari formu; tenant/DB lookup yok).
public sealed record DokumantasyonOnerIstegi(string AnahtarKodu, string? Etiket, string? Tip, string? Kategori, string? HedefAlan);

// v19 - Serbest prompt ile mail metni uretimi istegi (Inline AI Compose). Anahtar + serbest prompt + opsiyonel ton/uzunluk/mevcut.
public sealed record SerbestUretIstegi(string Anahtar, string Prompt, string? Ton, string? Uzunluk, string? MevcutMetin);
