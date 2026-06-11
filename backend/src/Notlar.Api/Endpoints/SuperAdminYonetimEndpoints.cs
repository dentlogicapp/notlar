using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

// v19 Asama 5 - Multi super admin yonetimi. super_admin flag ata/kaldir + son-admin korumasi.
// JWT'de super_admin claim oldugu icin yetki degisen kullanici YENIDEN GIRIS yapmali (Bolum 7H).
public static class SuperAdminYonetimEndpoints
{
    public static void MapSuperAdminYonetimEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/super-admin/yoneticiler")
            .WithTags("SuperAdminYonetim")
            .RequireAuthorization()
            .RequireSuperAdmin();

        // GET - mevcut super admin listesi
        g.MapGet("", async (AppDbContext db, CancellationToken ct) =>
        {
            var liste = await db.Kullanicilar
                .Where(u => u.SuperAdmin)
                .OrderBy(u => u.Email)
                .Select(u => new SuperAdminYaniti(u.Id, u.Email, u.AdSoyad, u.SonGirisZamani))
                .ToListAsync(ct);
            return Results.Ok(liste);
        });

        // POST - kullaniciya super_admin ver (email ile)
        g.MapPost("", async (SuperAdminAtaIstegi req, AppDbContext db, IAuditService audit, IUserContext uc, IOperasyonelBildirimGonderici bildirim, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Email))
                return Results.BadRequest(new { hata = "EMAIL_ZORUNLU", mesaj = "Email zorunlu." });

            var mail = req.Email.Trim().ToLowerInvariant();
            var user = await db.Kullanicilar.FirstOrDefaultAsync(u => u.Email == mail, ct);
            if (user is null)
                return Results.NotFound(new { hata = "KULLANICI_BULUNAMADI", mesaj = "Bu email ile kullanici bulunamadi." });
            if (user.SuperAdmin)
                return Results.BadRequest(new { hata = "ZATEN_SUPER_ADMIN", mesaj = "Kullanici zaten super admin." });

            user.SuperAdmin = true;
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("super_admin_atandi", hedefTip: "kullanici", hedefId: user.Id,
                degisenAlanlar: System.Text.Json.JsonSerializer.Serialize(new { email = mail }), ct: ct);

            bildirim.SuperAdminAtandi(mail, uc.Email ?? "sistem");

            // not: yetki degisen kullanici yeniden giris yapmali (JWT super_admin claim).
            return Results.Ok(new { kullaniciId = user.Id, email = mail, superAdmin = true });
        });

        // DELETE - super_admin geri al. Son super admin korunur (defense in depth).
        g.MapDelete("/{kullaniciId:guid}", async (Guid kullaniciId, AppDbContext db, IAuditService audit, IUserContext uc, IOperasyonelBildirimGonderici bildirim, CancellationToken ct) =>
        {
            var user = await db.Kullanicilar.FirstOrDefaultAsync(u => u.Id == kullaniciId, ct);
            if (user is null || !user.SuperAdmin)
                return Results.NotFound(new { hata = "SUPER_ADMIN_BULUNAMADI", mesaj = "Super admin bulunamadi." });

            // Son super admin'i kaldirmak YASAK (kendini kaldirma da bu kontrole tabi).
            var toplam = await db.Kullanicilar.CountAsync(u => u.SuperAdmin, ct);
            if (toplam <= 1)
                return Results.BadRequest(new { hata = "SON_SUPER_ADMIN_KORUNUR", mesaj = "Son super admin kaldirilamaz; once baska bir super admin atayin." });

            user.SuperAdmin = false;
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("super_admin_kaldirildi", hedefTip: "kullanici", hedefId: user.Id,
                degisenAlanlar: System.Text.Json.JsonSerializer.Serialize(new { email = user.Email }), ct: ct);

            bildirim.SuperAdminKaldirildi(user.Email, uc.Email ?? "sistem");

            return Results.Ok(new { kullaniciId = user.Id, superAdmin = false });
        });
    }
}

public record SuperAdminAtaIstegi(string Email);

public record SuperAdminYaniti(Guid Id, string Email, string AdSoyad, DateTimeOffset? SonGiris);
