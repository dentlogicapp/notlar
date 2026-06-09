using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using Notlar.Api.Models;
using Notlar.Api.Services;

using Notlar.Api.Models.Sema;

namespace Notlar.Api.Endpoints;

/// <summary>
/// Admin endpoint'leri — tenant-scoped (v15).
/// Bir tenant admin'i sadece kendi tenant'ının üyelerini görür/yönetir.
/// "Aktif" durumu artık tenant scope'ta (IsletmeUyelik.Aktif).
/// </summary>
public static class AdminEndpoints
{
    public static void MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin").WithTags("Admin").RequireAuthorization("AdminOnly");

        // LIST — sadece bu tenant'ın üyeleri
        g.MapGet("/kullanicilar", async (AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tenantId = uc.AktifIsletmeId.Value;

            // Üyelik + kullanıcı join
            var uyelikler = await db.IsletmeUyelikleri
                .Include(u => u.Kullanici)
                .Where(u => u.IsletmeId == tenantId)
                .OrderByDescending(u => u.KatilmaZamani)
                .ToListAsync(ct);

            // Not + klasör sayıları (tenant-scope)
            var notSayilari = await db.Notlar
                .Where(n => !n.Silindi && n.IsletmeId == tenantId)
                .GroupBy(n => n.OlusturanKullaniciId)
                .Select(grp => new { KullaniciId = grp.Key, Sayi = grp.Count() })
                .ToDictionaryAsync(x => x.KullaniciId, x => x.Sayi, ct);

            var klasorSayilari = await db.Klasorler
                .Where(k => !k.Silindi && !k.SistemMi && k.IsletmeId == tenantId)
                .GroupBy(k => k.OlusturanKullaniciId)
                .Select(grp => new { KullaniciId = grp.Key, Sayi = grp.Count() })
                .ToDictionaryAsync(x => x.KullaniciId, x => x.Sayi, ct);

            var list = uyelikler.Select(u => new KullaniciYaniti(
                u.Kullanici.Id, u.Kullanici.Email, u.Kullanici.AdSoyad,
                u.Rol,           // v15 — tenant scope Rol
                u.Aktif,         // v15 — tenant scope Aktif (IsletmeUyelik.Aktif)
                u.Kullanici.Cinsiyet,
                u.Kullanici.SifreBelirlenmeZamani != null,
                u.Kullanici.KilitlenmeZamani != null,
                u.Kullanici.OlusturmaZamani, u.Kullanici.SonGirisZamani,
                notSayilari.GetValueOrDefault(u.Kullanici.Id, 0),
                klasorSayilari.GetValueOrDefault(u.Kullanici.Id, 0)
            )).ToList();

            return Results.Ok(list);
        });

        // CREATE → setup mail + tenant'a üye olarak ekle
        g.MapPost("/kullanicilar", async (
            KullaniciOlusturIstegi req, AppDbContext db,
            IUserContext uc,
            IEmailService email, IAuditService audit, IIsletmeMetinService metinSvc,
            IConfiguration cfg, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.AdSoyad))
                return Results.BadRequest(new { hata = "Email ve ad soyad zorunlu." });
            if (req.Rol != "admin" && req.Rol != "kullanici")
                return Results.BadRequest(new { hata = "Rol 'admin' veya 'kullanici' olmalı." });
            if (req.Cinsiyet != "kadin" && req.Cinsiyet != "erkek")
                return Results.BadRequest(new { hata = "Cinsiyet 'kadin' veya 'erkek' olmalı." });
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);

            var tenantId = uc.AktifIsletmeId.Value;
            var mail = req.Email.Trim().ToLowerInvariant();

            // v15 — Bu email zaten varsa: sadece bu tenant'a yeni üyelik ekle (varsa)
            var mevcut = await db.Kullanicilar.FirstOrDefaultAsync(u => u.Email == mail, ct);

            // v18 Asama 17 - Mail guard (defense in depth): yeni kullaniciya davetiye gidecek.
            // Zorunlu davetiye metinleri (konu/giris/imza) bos ise bos/fallback mail gitmesin -> 412.
            // Mevcut kullaniciya uyelik eklemede mail gonderilmez, guard atlanir.
            if (mevcut is null)
            {
                var davetiyeAnahtarlari = new[]
                {
                    AnahtarKodu.MailDavetiyeKonu,
                    AnahtarKodu.MailDavetiyeGirisMetni,
                    AnahtarKodu.MailImza,
                };
                var tenantMetinleri = await metinSvc.TumunuGetirAsync(tenantId, ct);
                var doluSet = tenantMetinleri
                    .Where(m => !string.IsNullOrWhiteSpace(m.Icerik))
                    .Select(m => m.Anahtar)
                    .ToHashSet(StringComparer.Ordinal);
                var eksikMail = davetiyeAnahtarlari.Where(a => !doluSet.Contains(a)).ToList();
                if (eksikMail.Count > 0)
                    return Results.Json(
                        new { hata = "MAIL_METINLERI_EKSIK", eksikAnahtarlar = eksikMail },
                        statusCode: 412);
            }

            Kullanici user;
            string? setupToken = null;
            bool yeniKullanici = false;

            if (mevcut is not null)
            {
                // Zaten bu tenant'a üye mi?
                var zatenUye = await db.IsletmeUyelikleri
                    .AnyAsync(u => u.IsletmeId == tenantId && u.KullaniciId == mevcut.Id, ct);
                if (zatenUye)
                    return Results.BadRequest(new { hata = "Bu kullanıcı zaten markaya üye." });

                user = mevcut;
            }
            else
            {
                user = new Kullanici
                {
                    Email = mail,
                    AdSoyad = req.AdSoyad.Trim(),
                    Rol = "kullanici",  // global kullanıcı default kullanici, tenant scope rol IsletmeUyelik'te
                    Cinsiyet = req.Cinsiyet,
                    Aktif = true,
                };
                db.Kullanicilar.Add(user);
                yeniKullanici = true;

                // Setup token sadece yeni kullanıcı için
                setupToken = AuthEndpoints.TokenUret();
                db.AuthTokenlar.Add(new AuthToken
                {
                    KullaniciId = user.Id,
                    Token = setupToken,
                    Amac = "setup",
                    GecerlilikSonu = DateTimeOffset.UtcNow.AddHours(24)
                });
            }

            // Tenant üyeliği oluştur
            db.IsletmeUyelikleri.Add(new IsletmeUyelik
            {
                IsletmeId = tenantId,
                KullaniciId = user.Id,
                Rol = req.Rol,
                Aktif = true,
            });

            await db.SaveChangesAsync(ct);

            // Yeni kullanıcı için setup mail; mevcut kullanıcı yeni üyelikse mail GÖNDERME (zaten erişimi var)
            if (yeniKullanici && setupToken is not null)
            {
                // v18 - davetiye metinleri (konu/giris/imza/marka) EmailService icinde isletme_metinleri'nden render edilir (G.23-b)
                var frontend = cfg["FrontendBaseUrl"] ?? "http://localhost:3000";
                var link = $"{frontend}/sifre-belirle?token={setupToken}";
                await email.SifreBelirleMailGonderAsync(user.Email, user.AdSoyad, link, tenantId, ct);
            }

            await audit.YazAsync("kullanici_olusturuldu", "kullanici", user.Id,
                detay: $"Rol: {req.Rol}, Cinsiyet: {user.Cinsiyet}{(yeniKullanici ? "" : " (mevcut hesap üyelik eklendi)")}", ct: ct);

            return Results.Created($"/api/admin/kullanicilar/{user.Id}",
                new KullaniciYaniti(user.Id, user.Email, user.AdSoyad, req.Rol,
                    true, user.Cinsiyet,
                    user.SifreBelirlenmeZamani != null, user.KilitlenmeZamani != null,
                    user.OlusturmaZamani, user.SonGirisZamani,
                    0, 0));
        });

        // v18 Asama 17-E - wizard sonu welcome/davetiye onizleme test maili (kullanici OLUSTURMAZ)
        g.MapPost("/onboarding-test-mail", async (
            OnboardingTestMailIstegi req, IUserContext uc, IEmailService email,
            IIsletmeMetinService metinSvc, IConfiguration cfg, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Email))
                return Results.BadRequest(new { hata = "Email zorunlu." });
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);
            var tenantId = uc.AktifIsletmeId.Value;

            // Mail guard (defense in depth): zorunlu davetiye metinleri dolu olmali
            var davetiyeAnahtarlari = new[]
            {
                AnahtarKodu.MailDavetiyeKonu,
                AnahtarKodu.MailDavetiyeGirisMetni,
                AnahtarKodu.MailImza,
            };
            var metinler = await metinSvc.TumunuGetirAsync(tenantId, ct);
            var doluSet = metinler
                .Where(m => !string.IsNullOrWhiteSpace(m.Icerik))
                .Select(m => m.Anahtar)
                .ToHashSet(StringComparer.Ordinal);
            var eksik = davetiyeAnahtarlari.Where(a => !doluSet.Contains(a)).ToList();
            if (eksik.Count > 0)
                return Results.Json(
                    new { hata = "MAIL_METINLERI_EKSIK", eksikAnahtarlar = eksik },
                    statusCode: 412);

            // Davetiye onizlemesi: tenant'in kendi metniyle gercek render, link = frontend ana sayfa
            var frontend = cfg["FrontendBaseUrl"] ?? "http://localhost:3000";
            await email.SifreBelirleMailGonderAsync(
                req.Email.Trim(),
                string.IsNullOrWhiteSpace(req.Ad) ? "Misafir" : req.Ad!.Trim(),
                frontend, tenantId, ct);

            return Results.Ok(new { gonderildi = true });
        });

        // Admin trigger şifre sıfırlama
        g.MapPost("/kullanicilar/{id:guid}/sifre-sifirla", async (
            Guid id, AppDbContext db, IUserContext uc,
            IEmailService email, IAuditService audit,
            IConfiguration cfg, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);
            var tenantId = uc.AktifIsletmeId.Value;

            // Sadece bu tenant'ın üyesi için
            var uyelik = await db.IsletmeUyelikleri
                .Include(u => u.Kullanici)
                .FirstOrDefaultAsync(u => u.IsletmeId == tenantId && u.KullaniciId == id, ct);
            if (uyelik is null) return Results.NotFound();
            var user = uyelik.Kullanici;

            var token = AuthEndpoints.TokenUret();
            db.AuthTokenlar.Add(new AuthToken
            {
                KullaniciId = user.Id,
                Token = token,
                Amac = "reset",
                GecerlilikSonu = DateTimeOffset.UtcNow.AddHours(1)
            });
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

        // TOGGLE aktif (IsletmeUyelik.Aktif — tenant scope)
        g.MapPatch("/kullanicilar/{id:guid}/aktiflestir", async (
            Guid id, AppDbContext db, IUserContext uc,
            IAuditService audit, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);
            var tenantId = uc.AktifIsletmeId.Value;

            var uyelik = await db.IsletmeUyelikleri
                .Include(x => x.Kullanici)
                .FirstOrDefaultAsync(x => x.IsletmeId == tenantId && x.KullaniciId == id, ct);
            if (uyelik is null) return Results.NotFound();

            uyelik.Aktif = !uyelik.Aktif;
            await db.SaveChangesAsync(ct);
            await audit.YazAsync(uyelik.Aktif ? "kullanici_aktif" : "kullanici_pasif",
                "kullanici", id, detay: uyelik.Kullanici.Email, ct: ct);

            var notSayisi = await db.Notlar.CountAsync(
                n => n.OlusturanKullaniciId == id && !n.Silindi && n.IsletmeId == tenantId, ct);
            var klasorSayisi = await db.Klasorler.CountAsync(
                k => k.OlusturanKullaniciId == id && !k.SistemMi && !k.Silindi && k.IsletmeId == tenantId, ct);

            return Results.Ok(new KullaniciYaniti(
                id, uyelik.Kullanici.Email, uyelik.Kullanici.AdSoyad, uyelik.Rol, uyelik.Aktif,
                uyelik.Kullanici.Cinsiyet,
                uyelik.Kullanici.SifreBelirlenmeZamani != null,
                uyelik.Kullanici.KilitlenmeZamani != null,
                uyelik.Kullanici.OlusturmaZamani, uyelik.Kullanici.SonGirisZamani,
                notSayisi, klasorSayisi));
        });

        // Kilit aç (Kullanici tablosunda global — login için)
        g.MapPost("/kullanicilar/{id:guid}/kilit-ac", async (
            Guid id, AppDbContext db, IUserContext uc,
            IAuditService audit, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);
            var tenantId = uc.AktifIsletmeId.Value;

            // Tenant üyesi olduğunu doğrula
            var uyelikVar = await db.IsletmeUyelikleri
                .AnyAsync(u => u.IsletmeId == tenantId && u.KullaniciId == id, ct);
            if (!uyelikVar) return Results.NotFound();

            var u = await db.Kullanicilar.FindAsync(new object[] { id }, ct);
            if (u is null) return Results.NotFound();
            u.BasarisizDeneme = 0;
            u.KilitlenmeZamani = null;
            await db.SaveChangesAsync(ct);
            await audit.YazAsync("kilit_acildi", "kullanici", u.Id, detay: u.Email, ct: ct);
            return Results.Ok(new { mesaj = "Kilit kaldırıldı." });
        });

        // DELETE — bu tenant'tan çıkar
        g.MapDelete("/kullanicilar/{id:guid}", async (
            Guid id, bool? devret, AppDbContext db, IUserContext uc,
            IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId == id)
                return Results.BadRequest(new { hata = "Kendi hesabını silemezsin." });
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);
            var tenantId = uc.AktifIsletmeId.Value;

            // Sadece bu tenant'ın üyeliğini kontrol et
            var uyelik = await db.IsletmeUyelikleri
                .Include(x => x.Kullanici)
                .FirstOrDefaultAsync(x => x.IsletmeId == tenantId && x.KullaniciId == id, ct);
            if (uyelik is null) return Results.NotFound();

            // Bu tenant'taki not/klasör sayıları
            var notSayisi = await db.Notlar.CountAsync(
                n => n.OlusturanKullaniciId == id && !n.Silindi && n.IsletmeId == tenantId, ct);
            var klasorSayisi = await db.Klasorler.CountAsync(
                k => k.OlusturanKullaniciId == id && !k.SistemMi && k.IsletmeId == tenantId, ct);

            if ((notSayisi > 0 || klasorSayisi > 0) && devret != true)
            {
                return Results.BadRequest(new {
                    hata = $"Bu kullanıcının markada {notSayisi} notu ve {klasorSayisi} klasörü var. " +
                           "Önce devret seçeneğiyle çağır veya pasifleştir.",
                    notSayisi,
                    klasorSayisi
                });
            }

            if (devret == true && (notSayisi > 0 || klasorSayisi > 0))
            {
                var devralan = uc.KullaniciId.Value;

                // Sadece bu tenant'taki notlar
                var notlar = await db.Notlar
                    .Where(n => n.OlusturanKullaniciId == id && n.IsletmeId == tenantId)
                    .ToListAsync(ct);
                foreach (var n in notlar)
                {
                    n.OlusturanKullaniciId = devralan;
                    n.GuncellemeZamani = DateTimeOffset.UtcNow;
                }

                // Sadece bu tenant'taki klasörler
                var klasorler = await db.Klasorler
                    .Where(k => k.OlusturanKullaniciId == id && !k.SistemMi && k.IsletmeId == tenantId)
                    .ToListAsync(ct);
                foreach (var k in klasorler)
                    k.OlusturanKullaniciId = devralan;
            }

            // Sistem klasörlerini (Tamamlananlar) bu tenant'ta çağıran admin'e devret
            var sistemKlasorler = await db.Klasorler
                .Where(k => k.OlusturanKullaniciId == id && k.SistemMi && k.IsletmeId == tenantId)
                .ToListAsync(ct);
            foreach (var sk in sistemKlasorler)
                sk.OlusturanKullaniciId = uc.KullaniciId.Value;

            // Tenant üyeliğini sil (Kullanici global kalır)
            db.IsletmeUyelikleri.Remove(uyelik);

            // Eğer kullanıcı başka tenant'a üye değilse + super_admin değilse, global olarak da sil
            var baskaUyelikVar = await db.IsletmeUyelikleri
                .AnyAsync(u => u.KullaniciId == id && u.IsletmeId != tenantId, ct);
            var kullaniciSuperAdmin = uyelik.Kullanici.SuperAdmin;
            if (!baskaUyelikVar && !kullaniciSuperAdmin)
            {
                // Tüm AktifIsletmeId referansını temizle (zaten cascade ama defansif)
                var k = await db.Kullanicilar.FindAsync(new object[] { id }, ct);
                if (k is not null) db.Kullanicilar.Remove(k);
            }

            await db.SaveChangesAsync(ct);

            var detay = devret == true && (notSayisi > 0 || klasorSayisi > 0)
                ? $"{uyelik.Kullanici.Email} (devir: {notSayisi} not, {klasorSayisi} klasör)"
                : uyelik.Kullanici.Email;
            await audit.YazAsync("kullanici_silindi", "kullanici", id, detay: detay, ct: ct);

            return Results.NoContent();
        });

        // Denetim günlüğü — tenant-filtered
        g.MapGet("/denetim", async (
            AppDbContext db, IUserContext uc, int skip = 0, int take = 50,
            CancellationToken ct = default) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tenantId = uc.AktifIsletmeId.Value;
            take = Math.Min(take, 200);
            var sorgu = db.DenetimGunlukleri
                .Where(d => d.IsletmeId == tenantId);

            var list = await sorgu
                .OrderByDescending(d => d.Zaman)
                .Skip(skip).Take(take)
                .Select(d => new DenetimYaniti(
                    d.Id, d.Olay, d.HedefTip, d.HedefId,
                    d.AktorKullaniciId, d.AktorEmail,
                    d.Ip, d.Detay, d.DegisenAlanlar, d.Zaman))
                .ToListAsync(ct);
            var toplam = await sorgu.CountAsync(ct);
            return Results.Ok(new { toplam, kayitlar = list });
        });
    }
}
