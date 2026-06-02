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
                    u.Cinsiyet,
                    u.SifreBelirlenmeZamani != null,
                    u.KilitlenmeZamani != null,
                    u.OlusturmaZamani, u.SonGirisZamani))
                .ToListAsync(ct);
            return Results.Ok(list);
        });

        // CREATE → setup mail (Alt-3: cinsiyet zorunlu, gönderen adı imzaya geçer)
        g.MapPost("/kullanicilar", async (
            KullaniciOlusturIstegi req, AppDbContext db,
            IUserContext uc,
            IEmailService email, IAuditService audit,
            IConfiguration cfg, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.AdSoyad))
                return Results.BadRequest(new { hata = "Email ve ad soyad zorunlu." });
            if (req.Rol != "admin" && req.Rol != "kullanici")
                return Results.BadRequest(new { hata = "Rol 'admin' veya 'kullanici' olmalı." });
            if (req.Cinsiyet != "kadin" && req.Cinsiyet != "erkek")
                return Results.BadRequest(new { hata = "Cinsiyet 'kadin' veya 'erkek' olmalı." });

            var mail = req.Email.Trim().ToLowerInvariant();
            if (await db.Kullanicilar.AnyAsync(u => u.Email == mail, ct))
                return Results.BadRequest(new { hata = "Bu email kullanımda." });

            var user = new Kullanici
            {
                Email = mail,
                AdSoyad = req.AdSoyad.Trim(),
                Rol = req.Rol,
                Cinsiyet = req.Cinsiyet,
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

            // Gönderen ilk adı (imza için — "Sevgilerle, Musa 🤍")
            var gonderen = await db.Kullanicilar
                .Where(u => u.Id == uc.KullaniciId)
                .Select(u => u.AdSoyad)
                .FirstOrDefaultAsync(ct) ?? "Aşkın";
            var gonderenIlkAd = gonderen.Split(' ')[0];

            // Setup mail
            var frontend = cfg["FrontendBaseUrl"] ?? "http://localhost:3000";
            var link = $"{frontend}/sifre-belirle?token={token}";
            await email.SifreBelirleMailGonderAsync(user.Email, user.AdSoyad, link, gonderenIlkAd, ct);

            await audit.YazAsync("kullanici_olusturuldu", "kullanici", user.Id,
                detay: $"Rol: {user.Rol}, Cinsiyet: {user.Cinsiyet}", ct: ct);

            return Results.Created($"/api/admin/kullanicilar/{user.Id}",
                new KullaniciYaniti(user.Id, user.Email, user.AdSoyad, user.Rol,
                    user.Aktif, user.Cinsiyet, false, false, user.OlusturmaZamani, null));
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
                u.Cinsiyet,
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
            Guid id, AppDbContext db, IUserContext uc, IAuditService audit, CancellationToken ct) =>
        {
            // v11 — Kendini silmeye karşı koruma
            if (uc.KullaniciId == id)
                return Results.BadRequest(new { hata = "Kendi hesabını silemezsin." });

            var u = await db.Kullanicilar.FindAsync([id], ct);
            if (u is null) return Results.NotFound();

            // FK kontrolü 1: kullanıcının oluşturduğu notlar
            var notVar = await db.Notlar.AnyAsync(n => n.OlusturanKullaniciId == id, ct);
            if (notVar)
                return Results.BadRequest(new { hata = "Bu kullanıcının notları var. Önce notları başkasına devret veya pasifleştir." });

            // v11 — FK kontrolü 2: kullanıcının oluşturduğu klasörler (sistem klasörü hariç)
            var klasorVar = await db.Klasorler.AnyAsync(k => k.OlusturanKullaniciId == id && !k.SistemMi, ct);
            if (klasorVar)
                return Results.BadRequest(new { hata = "Bu kullanıcının oluşturduğu klasörler var. Önce klasörleri başkasına devret veya pasifleştir." });

            // v11 — Sistem klasörlerini başka admin'e devret (Tamamlananlar gibi)
            // İlk admin'i bul (kendisi olmasın)
            var devralanAdmin = await db.Kullanicilar
                .Where(k => k.Rol == "admin" && k.Id != id && k.Aktif)
                .OrderBy(k => k.OlusturmaZamani)
                .Select(k => k.Id)
                .FirstOrDefaultAsync(ct);

            if (devralanAdmin != Guid.Empty)
            {
                var sistemKlasorler = await db.Klasorler
                    .Where(k => k.OlusturanKullaniciId == id && k.SistemMi)
                    .ToListAsync(ct);
                foreach (var sk in sistemKlasorler)
                    sk.OlusturanKullaniciId = devralanAdmin;
            }
            // not_gecmisi'ndeki YapanKullaniciId otomatik SET NULL olacak (v11 FK)

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
