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
            var kullanicilar = await db.Kullanicilar
                .OrderByDescending(u => u.OlusturmaZamani)
                .ToListAsync(ct);

            // v12 — Not + klasör sayıları (silme onayında gösterilecek)
            var notSayilari = await db.Notlar
                .Where(n => !n.Silindi)
                .GroupBy(n => n.OlusturanKullaniciId)
                .Select(g => new { KullaniciId = g.Key, Sayi = g.Count() })
                .ToDictionaryAsync(x => x.KullaniciId, x => x.Sayi, ct);

            var klasorSayilari = await db.Klasorler
                .Where(k => !k.Silindi && !k.SistemMi)
                .GroupBy(k => k.OlusturanKullaniciId)
                .Select(g => new { KullaniciId = g.Key, Sayi = g.Count() })
                .ToDictionaryAsync(x => x.KullaniciId, x => x.Sayi, ct);

            var list = kullanicilar.Select(u => new KullaniciYaniti(
                u.Id, u.Email, u.AdSoyad, u.Rol, u.Aktif,
                u.Cinsiyet,
                u.SifreBelirlenmeZamani != null,
                u.KilitlenmeZamani != null,
                u.OlusturmaZamani, u.SonGirisZamani,
                notSayilari.GetValueOrDefault(u.Id, 0),
                klasorSayilari.GetValueOrDefault(u.Id, 0)
            )).ToList();

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
        // v12 — Query param: ?devret=true → kullanıcının notları ve klasörleri çağıran admin'e devredilir
        //                    yoksa kullanıcının notu/klasörü varsa sileme engellenir
        g.MapDelete("/kullanicilar/{id:guid}", async (
            Guid id, bool? devret, AppDbContext db, IUserContext uc,
            IAuditService audit, CancellationToken ct) =>
        {
            // Kendini silmeye karşı koruma
            if (uc.KullaniciId == id)
                return Results.BadRequest(new { hata = "Kendi hesabını silemezsin." });
            if (uc.KullaniciId is null)
                return Results.Unauthorized();

            var u = await db.Kullanicilar.FindAsync([id], ct);
            if (u is null) return Results.NotFound();

            // Sayıları hesapla
            var notSayisi = await db.Notlar.CountAsync(n => n.OlusturanKullaniciId == id && !n.Silindi, ct);
            var klasorSayisi = await db.Klasorler.CountAsync(k => k.OlusturanKullaniciId == id && !k.SistemMi, ct);

            // devret=false (varsayılan) ve verisi varsa → engelle
            if ((notSayisi > 0 || klasorSayisi > 0) && devret != true)
            {
                return Results.BadRequest(new {
                    hata = $"Bu kullanıcının {notSayisi} notu ve {klasorSayisi} klasörü var. " +
                           "Önce devret seçeneğiyle çağır veya pasifleştir.",
                    notSayisi,
                    klasorSayisi
                });
            }

            // devret=true → veri admin'e geçer
            if (devret == true && (notSayisi > 0 || klasorSayisi > 0))
            {
                var devralan = uc.KullaniciId.Value;

                // Notlar (silinmiş olanlar dahil — tüm not geçmişi korunur)
                var notlar = await db.Notlar.Where(n => n.OlusturanKullaniciId == id).ToListAsync(ct);
                foreach (var n in notlar)
                {
                    n.OlusturanKullaniciId = devralan;
                    n.GuncellemeZamani = DateTimeOffset.UtcNow;
                }

                // Klasörler (silinmiş + sistem dahil; sistem zaten devredilir aşağıda)
                var klasorler = await db.Klasorler.Where(k => k.OlusturanKullaniciId == id && !k.SistemMi).ToListAsync(ct);
                foreach (var k in klasorler)
                    k.OlusturanKullaniciId = devralan;
            }

            // Sistem klasörlerini her durumda çağıran admin'e devret (Tamamlananlar gibi)
            var sistemKlasorler = await db.Klasorler
                .Where(k => k.OlusturanKullaniciId == id && k.SistemMi)
                .ToListAsync(ct);
            foreach (var sk in sistemKlasorler)
                sk.OlusturanKullaniciId = uc.KullaniciId.Value;

            // not_gecmisi'ndeki YapanKullaniciId v11 FK gereği otomatik SET NULL

            db.Kullanicilar.Remove(u);
            await db.SaveChangesAsync(ct);

            var detay = devret == true && (notSayisi > 0 || klasorSayisi > 0)
                ? $"{u.Email} (devir: {notSayisi} not, {klasorSayisi} klasör)"
                : u.Email;
            await audit.YazAsync("kullanici_silindi", "kullanici", id, detay: detay, ct: ct);

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
