using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using Notlar.Api.Models;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

public static class AdminEndpoints
{
    public static void MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin").WithTags("Admin").RequireAuthorization("AdminOnly");

        // LIST
        g.MapGet("/kullanicilar", async (AppDbContext db, CancellationToken ct) =>
        {
            var list = await db.Kullanicilar
                .OrderByDescending(u => u.OlusturmaZamani)
                .Select(u => new KullaniciYaniti(
                    u.Id, u.Email, u.AdSoyad, u.Rol, u.Aktif,
                    u.SifreBelirlenmeZamani != null,
                    u.KilitlenmeZamani != null,
                    u.OlusturmaZamani, u.SonGirisZamani))
                .ToListAsync(ct);
            return Results.Ok(list);
        });

        // CREATE → setup mail
        g.MapPost("/kullanicilar", async (
            KullaniciOlusturIstegi req, AppDbContext db,
            IEmailService email, IAuditService audit,
            IConfiguration cfg, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.AdSoyad))
                return Results.BadRequest(new { hata = "Email ve ad soyad zorunlu." });
            if (req.Rol != "admin" && req.Rol != "kullanici")
                return Results.BadRequest(new { hata = "Rol 'admin' veya 'kullanici' olmalı." });

            var mail = req.Email.Trim().ToLowerInvariant();
            if (await db.Kullanicilar.AnyAsync(u => u.Email == mail, ct))
                return Results.BadRequest(new { hata = "Bu email kullanımda." });

            var user = new Kullanici
            {
                Email = mail,
                AdSoyad = req.AdSoyad.Trim(),
                Rol = req.Rol,
                Aktif = true
            };
            db.Kullanicilar.Add(user);

            // Setup token
            var token = AuthEndpoints.TokenUret();
            db.AuthTokenlar.Add(new AuthToken
            {
                KullaniciId = user.Id,
                Token = token,
                Amac = "setup",
                GecerlilikSonu = DateTimeOffset.UtcNow.AddHours(24)
            });
            await db.SaveChangesAsync(ct);

            // Setup mail
            var frontend = cfg["FrontendBaseUrl"] ?? "http://localhost:3000";
            var link = $"{frontend}/sifre-belirle?token={token}";
            await email.SifreBelirleMailGonderAsync(user.Email, user.AdSoyad, link, ct);

            await audit.YazAsync("kullanici_olusturuldu", "kullanici", user.Id, detay: $"Rol: {user.Rol}", ct: ct);

            return Results.Created($"/api/admin/kullanicilar/{user.Id}",
                new KullaniciYaniti(user.Id, user.Email, user.AdSoyad, user.Rol,
                    user.Aktif, false, false, user.OlusturmaZamani, null));
        });

        // Admin trigger şifre sıfırlama → kullanıcıya mail
        g.MapPost("/kullanicilar/{id:guid}/sifre-sifirla", async (
            Guid id, AppDbContext db,
            IEmailService email, IAuditService audit,
            IConfiguration cfg, CancellationToken ct) =>
        {
            var user = await db.Kullanicilar.FindAsync([id], ct);
            if (user is null) return Results.NotFound();

            var token = AuthEndpoints.TokenUret();
            db.AuthTokenlar.Add(new AuthToken
            {
                KullaniciId = user.Id,
                Token = token,
                Amac = "reset",
                GecerlilikSonu = DateTimeOffset.UtcNow.AddHours(1)
            });
            // Kilit varsa kaldır (admin müdahalesi)
            user.BasarisizDeneme = 0;
            user.KilitlenmeZamani = null;
            await db.SaveChangesAsync(ct);

            var frontend = cfg["FrontendBaseUrl"] ?? "http://localhost:3000";
            var link = $"{frontend}/sifre-sifirla?token={token}";
            await email.SifreSifirlamaMailGonderAsync(user.Email, user.AdSoyad, link, ct);

            await audit.YazAsync("admin_sifre_sifirla", "kullanici", user.Id,
                detay: $"Hedef: {user.Email}", ct: ct);
            return Results.Ok(new { mesaj = "Sıfırlama maili gönderildi." });
        });

        // TOGGLE aktif
        g.MapPatch("/kullanicilar/{id:guid}/aktiflestir", async (
            Guid id, AppDbContext db, IAuditService audit, CancellationToken ct) =>
        {
            var u = await db.Kullanicilar.FindAsync([id], ct);
            if (u is null) return Results.NotFound();
            u.Aktif = !u.Aktif;
            await db.SaveChangesAsync(ct);
            await audit.YazAsync(u.Aktif ? "kullanici_aktif" : "kullanici_pasif",
                "kullanici", u.Id, detay: u.Email, ct: ct);
            return Results.Ok(new KullaniciYaniti(u.Id, u.Email, u.AdSoyad, u.Rol, u.Aktif,
                u.SifreBelirlenmeZamani != null, u.KilitlenmeZamani != null,
                u.OlusturmaZamani, u.SonGirisZamani));
        });

        // Kilidi aç (admin)
        g.MapPost("/kullanicilar/{id:guid}/kilit-ac", async (
            Guid id, AppDbContext db, IAuditService audit, CancellationToken ct) =>
        {
            var u = await db.Kullanicilar.FindAsync([id], ct);
            if (u is null) return Results.NotFound();
            u.BasarisizDeneme = 0;
            u.KilitlenmeZamani = null;
            await db.SaveChangesAsync(ct);
            await audit.YazAsync("kilit_acildi", "kullanici", u.Id, detay: u.Email, ct: ct);
            return Results.Ok(new { mesaj = "Kilit kaldırıldı." });
        });

        // DELETE
        g.MapDelete("/kullanicilar/{id:guid}", async (
            Guid id, AppDbContext db, IAuditService audit, CancellationToken ct) =>
        {
            var u = await db.Kullanicilar.FindAsync([id], ct);
            if (u is null) return Results.NotFound();
            var notVar = await db.Notlar.AnyAsync(n => n.OlusturanKullaniciId == id, ct);
            if (notVar)
                return Results.BadRequest(new { hata = "Bu kullanıcının notları var. Önce pasifleştir." });
            db.Kullanicilar.Remove(u);
            await db.SaveChangesAsync(ct);
            await audit.YazAsync("kullanici_silindi", "kullanici", id, detay: u.Email, ct: ct);
            return Results.NoContent();
        });

        // Denetim günlüğü
        g.MapGet("/denetim", async (
            AppDbContext db, int skip = 0, int take = 50,
            CancellationToken ct = default) =>
        {
            take = Math.Min(take, 200);
            var list = await db.DenetimGunlukleri
                .OrderByDescending(d => d.Zaman)
                .Skip(skip).Take(take)
                .Select(d => new DenetimYaniti(
                    d.Id, d.Olay, d.HedefTip, d.HedefId,
                    d.AktorKullaniciId, d.AktorEmail,
                    d.Ip, d.Detay, d.DegisenAlanlar, d.Zaman))
                .ToListAsync(ct);
            var toplam = await db.DenetimGunlukleri.CountAsync(ct);
            return Results.Ok(new { toplam, kayitlar = list });
        });
    }
}
