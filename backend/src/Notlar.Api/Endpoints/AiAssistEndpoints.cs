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
            IAiAssistServiceFactory factory, IIsletmeMetinService metinSvc, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tid = uc.AktifIsletmeId.Value;

            if (string.IsNullOrWhiteSpace(req.Prompt))
                return Results.BadRequest(new { hata = "PROMPT_ZORUNLU", mesaj = "Prompt bos olamaz." });

            var katalog = await db.MetinAnahtarlari
                .FirstOrDefaultAsync(a => a.Anahtar == req.Anahtar && !a.Deprecated, ct);
            if (katalog is null)
                return Results.NotFound(new { hata = "ANAHTAR_BULUNAMADI", mesaj = "Metin anahtari bulunamadi." });

            // Defense in depth: serbest uretim YALNIZ mail kategorisinde (maliyet + kapsam koruma).
            // Frontend butonu zaten sadece mail'de gosterir; bu backend ikinci kale.
            if (katalog.Kategori != "mail")
                return Results.Json(new { hata = "KATEGORI_DESTEKLENMIYOR", mesaj = "Serbest uretim yalniz mail alanlarinda kullanilabilir." }, statusCode: 403);

            var metinler = await metinSvc.TumunuGetirAsync(tid, ct);
            var markaAdi = metinler.FirstOrDefault(m => m.Anahtar == "marka_adi")?.Icerik ?? "";

            var baglam = new SerbestUretBaglam(
                req.Prompt,
                katalog.Anahtar,
                katalog.Etiket,
                katalog.Yonlendirme,
                katalog.Tip,
                markaAdi,
                req.MevcutMetin,
                req.Ton,
                req.Uzunluk);

            try
            {
                var servis = await factory.ServisGetirAsync(ct);
                var metin = await servis.SerbestUretAsync(baglam, ct);
                return Results.Ok(new { metin });
            }
            catch (AiKullanilamazException ex)
            {
                return Results.Json(new { hata = ex.Kod, mesaj = "AI su an kullanilamiyor." }, statusCode: 503);
            }
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
