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
    }

    private static IReadOnlyList<string> PlaceholderListesi(string jsonb)
    {
        try { return JsonSerializer.Deserialize<List<string>>(jsonb) ?? new List<string>(); }
        catch { return new List<string>(); }
    }
}

// Body: anahtar + ton/uzunluk/etkinlik baglami (katalog + tenant verisi backend'de doldurulur).
public sealed record TaslakOnerIstegi(string Anahtar, string? Ton, string? Uzunluk, string? EtkinlikTanimi);
