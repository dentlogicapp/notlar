using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Models;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

/// <summary>
/// v15 — İşletme (tenant) endpoint'leri.
/// Kullanıcının üye olduğu tenant'ları listeler ve aktif tenant değişimini sağlar.
/// </summary>
public static class IsletmeEndpoints
{
    public static void MapIsletmeEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/isletmeler").WithTags("Isletmeler").RequireAuthorization();

        // GET /api/isletmeler/uyelik — kullanıcının üye olduğu tenantlar
        g.MapGet("/uyelik", async (AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            var uid = uc.KullaniciId.Value;

            var uyelikler = await db.IsletmeUyelikleri
                .Include(u => u.Isletme)
                .Where(u => u.KullaniciId == uid && u.Aktif
                         && u.Isletme.Aktif && !u.Isletme.Silindi)
                .OrderBy(u => u.Isletme.MarkaAdi)
                .Select(u => new UyelikYaniti(
                    u.IsletmeId, u.Isletme.MarkaAdi, u.Isletme.MarkaEmoji,
                    u.Isletme.KullanimModu, u.Rol, u.Aktif))
                .ToListAsync(ct);

            return Results.Ok(uyelikler);
        });

        // POST /api/isletmeler/aktif/{id} — aktif tenant değiştir + JWT yenile
        g.MapPost("/aktif/{id:guid}", async (
            Guid id, AppDbContext db, IUserContext uc,
            IJwtService jwt, IAuditService audit,
            HttpContext http, IConfiguration cfg, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            var uid = uc.KullaniciId.Value;

            // Kullanıcı bu tenant'a üye mi? (Süper admin DEĞIL — süper admin için ayrı endpoint v17'de)
            var uyelik = await db.IsletmeUyelikleri
                .Include(u => u.Isletme)
                .FirstOrDefaultAsync(u => u.KullaniciId == uid && u.IsletmeId == id
                                       && u.Aktif && u.Isletme.Aktif && !u.Isletme.Silindi, ct);
            if (uyelik is null) return Results.NotFound(new { hata = "Bu markaya üye değilsin." });

            // Aktif tenant güncelle
            var user = await db.Kullanicilar.FindAsync(new object[] { uid }, ct);
            if (user is null) return Results.Unauthorized();
            user.AktifIsletmeId = id;
            await db.SaveChangesAsync(ct);

            // JWT yenile
            var token = jwt.TokenUret(user);
            var gun = int.Parse(cfg["Jwt:GunOmru"] ?? "30");
            AuthEndpoints.CookieEkle(http, token, gun, cfg, persistent: true);

            await audit.YazAsync("tenant_degistirildi", "isletme", id,
                detay: $"{user.Email} → {uyelik.Isletme.MarkaAdi}", ct: ct);

            // Yeni üyelikleri tekrar yükle (response için)
            var uyelikler = await db.IsletmeUyelikleri
                .Include(u => u.Isletme)
                .Where(u => u.KullaniciId == uid && u.Aktif
                         && u.Isletme.Aktif && !u.Isletme.Silindi)
                .OrderBy(u => u.Isletme.MarkaAdi)
                .Select(u => new UyelikYaniti(
                    u.IsletmeId, u.Isletme.MarkaAdi, u.Isletme.MarkaEmoji,
                    u.Isletme.KullanimModu, u.Rol, u.Aktif))
                .ToListAsync(ct);

            return Results.Ok(new BenYaniti(
                user.Id, user.Email, user.AdSoyad, user.Rol, user.Cinsiyet,
                user.SuperAdmin, user.AktifIsletmeId, uyelikler));
        });

        // GET /api/isletmeler/aktif — aktif tenant ayarları (Marka & Görünüm için, v16'da detaylı)
        g.MapGet("/aktif", async (AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tenantId = uc.AktifIsletmeId.Value;

            var i = await db.Isletmeler.FindAsync(new object[] { tenantId }, ct);
            if (i is null) return Results.NotFound();

            return Results.Ok(new IsletmeYaniti(
                i.Id, i.MarkaAdi, i.MarkaEmoji, i.IkonSeti,
                i.KarsilamaBasligi, i.KarsilamaAltMetni,
                i.SayacAktif, i.SayacBasligi, i.SayacHedefTarihi,
                i.MailImza, i.MailTonu, i.KullanimModu));
        });
    }
}
