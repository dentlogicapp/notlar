using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using Notlar.Api.Models;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

// v18 Asama 17.3 - App push notification cihaz kaydi (normal kullanici endpoint'i, super admin DEGIL).
public static class CihazEndpoints
{
    private static readonly string[] GecerliPlatformlar = { "ios", "android", "web" };

    public static void MapCihazEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/cihazlar").RequireAuthorization().WithTags("Cihazlar");

        // POST /kayit - idempotent: ayni PushToken varsa SonAktiflik update
        g.MapPost("/kayit", async (CihazKayitIstegi req, AppDbContext db, IUserContext uc,
            IAuditService audit, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.PushToken))
                return Results.Json(new { hata = "PUSH_TOKEN_BOS" }, statusCode: 400);
            if (!GecerliPlatformlar.Contains(req.Platform))
                return Results.Json(new { hata = "PLATFORM_GECERSIZ" }, statusCode: 400);
            if (uc.KullaniciId is null) return Results.Unauthorized();
            var kid = uc.KullaniciId.Value;

            var mevcut = await db.KullaniciCihazlari
                .FirstOrDefaultAsync(x => x.PushToken == req.PushToken, ct);
            if (mevcut is not null)
            {
                mevcut.SonAktiflik = DateTimeOffset.UtcNow;
                mevcut.CihazAdi = req.CihazAdi;
                mevcut.PushP256dh = req.P256dh;  // Web Push abonelik yenilenebilir
                mevcut.PushAuth = req.Auth;
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { id = mevcut.Id, olusturuldu = false });
            }

            var cihaz = new KullaniciCihaz
            {
                KullaniciId = kid,
                PushToken = req.PushToken.Trim(),
                PushP256dh = req.P256dh,
                PushAuth = req.Auth,
                Platform = req.Platform,
                CihazAdi = req.CihazAdi,
            };
            db.KullaniciCihazlari.Add(cihaz);
            await audit.YazAsync("cihaz_kaydedildi", "kullanici_cihazi", cihaz.Id, ct: ct);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { id = cihaz.Id, olusturuldu = true });
        });

        // DELETE /{id} - defense in depth: sadece kendi cihazi silinebilir
        g.MapDelete("/{id:guid}", async (Guid id, AppDbContext db, IUserContext uc,
            IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            var cihaz = await db.KullaniciCihazlari.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (cihaz is null)
                return Results.Json(new { hata = "CIHAZ_BULUNAMADI" }, statusCode: 404);
            if (cihaz.KullaniciId != uc.KullaniciId.Value)
                return Results.Json(new { hata = "ERISIM_YOK" }, statusCode: 403);

            db.KullaniciCihazlari.Remove(cihaz);
            await audit.YazAsync("cihaz_silindi", "kullanici_cihazi", id, ct: ct);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { silindi = true });
        });

        // GET - kullanicinin cihazlari (PushToken sansurlu, son 4 karakter)
        g.MapGet("", async (AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            var kid = uc.KullaniciId.Value;
            var liste = await db.KullaniciCihazlari
                .Where(x => x.KullaniciId == kid)
                .OrderByDescending(x => x.SonAktiflik)
                .Select(x => new CihazYaniti(
                    x.Id, x.Platform, x.CihazAdi,
                    x.PushToken.Length >= 4 ? "..." + x.PushToken.Substring(x.PushToken.Length - 4) : "...",
                    x.OlusturmaZamani, x.SonAktiflik))
                .ToListAsync(ct);
            return Results.Ok(liste);
        });
    }
}
