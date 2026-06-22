using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using Notlar.Api.Models;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

public static class AuthEndpoints
{
    private const int MaksDeneme = 5;
    private static readonly TimeSpan KilitSuresi = TimeSpan.FromMinutes(15);

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/auth").WithTags("Auth");

        // 1. Giriş (email + şifre)
        g.MapPost("/giris", async (
            GirisIstegi req, AppDbContext db, IPasswordService pwd,
            IJwtService jwt, IAuditService audit, HttpContext http,
            IConfiguration cfg, CancellationToken ct) =>
        {
            var email = (req.Email ?? "").Trim().ToLowerInvariant();
            var user = await db.Kullanicilar.FirstOrDefaultAsync(u => u.Email == email, ct);

            // Kullanıcı yok veya şifre belirlenmemiş — info leak önlemek için generic mesaj
            if (user is null || string.IsNullOrEmpty(user.SifreHash))
            {
                await audit.YazAsync("giris_basarisiz", aktorEmail: email,
                    detay: user is null ? "Kullanıcı yok" : "Şifre belirlenmemiş", ct: ct);
                return Results.BadRequest(new { hata = "Email veya şifre hatalı." });
            }

            // v11 — Pasif kullanıcı: net mesaj, info leak değil çünkü email zaten doğrulandı (şifre belirli)
            if (!user.Aktif)
            {
                await audit.YazAsync("giris_basarisiz", "kullanici", user.Id, user.Id, email,
                    detay: "Hesap pasif", ct: ct);
                return Results.BadRequest(new {
                    hata = "Hesabın yönetici tarafından pasifleştirildi. Lütfen yöneticiyle iletişime geç."
                });
            }

            // Kilit kontrol
            if (user.KilitlenmeZamani.HasValue && user.KilitlenmeZamani.Value.Add(KilitSuresi) > DateTimeOffset.UtcNow)
            {
                var kalanDk = (int)(user.KilitlenmeZamani.Value.Add(KilitSuresi) - DateTimeOffset.UtcNow).TotalMinutes + 1;
                await audit.YazAsync("giris_basarisiz", aktorEmail: email, aktorId: user.Id, detay: "Hesap kilitli", ct: ct);
                return Results.BadRequest(new { hata = $"Hesabın {kalanDk} dakika boyunca kilitli. Admin'e ulaş veya şifre sıfırla." });
            }

            if (!pwd.Dogrula(req.Sifre ?? "", user.SifreHash))
            {
                user.BasarisizDeneme++;
                if (user.BasarisizDeneme >= MaksDeneme)
                {
                    user.KilitlenmeZamani = DateTimeOffset.UtcNow;
                    await audit.YazAsync("hesap_kilitlendi", "kullanici", user.Id, user.Id, email, ct: ct);
                }
                await db.SaveChangesAsync(ct);
                await audit.YazAsync("giris_basarisiz", aktorEmail: email, aktorId: user.Id,
                    detay: $"Deneme: {user.BasarisizDeneme}/{MaksDeneme}", ct: ct);
                return Results.BadRequest(new {
                    hata = user.BasarisizDeneme >= MaksDeneme
                        ? "5 yanlış deneme. Hesabın geçici olarak kilitlendi. Şifre sıfırla veya admin'e ulaş."
                        : $"Email veya şifre hatalı. Kalan deneme: {MaksDeneme - user.BasarisizDeneme}"
                });
            }

            // Başarılı
            user.BasarisizDeneme = 0;
            user.KilitlenmeZamani = null;
            user.SonGirisZamani = DateTimeOffset.UtcNow;

            // v15 — Multi-tenant: aktif tenant kontrolü
            var uyelikler = await db.IsletmeUyelikleri
                .Include(u => u.Isletme)
                .Where(u => u.KullaniciId == user.Id && u.Aktif
                         && u.Isletme.Aktif && !u.Isletme.Silindi)
                .OrderBy(u => u.Isletme.MarkaAdi)
                .ToListAsync(ct);

            // 0 tenant + super_admin değil → erişim yok
            if (uyelikler.Count == 0 && !user.SuperAdmin)
            {
                await audit.YazAsync("giris_basarisiz", "kullanici", user.Id, user.Id, email,
                    detay: "Hiçbir tenant'a üye değil", ct: ct);
                return Results.BadRequest(new {
                    hata = "Hesabın hiçbir markaya bağlı değil. Yöneticiyle iletişime geç."
                });
            }

            // AktifIsletmeId — eğer null ise veya artık üye değilse, ilk tenant'a default ata
            // Super admin + 0 tenant → null kalır, frontend süper yönetim paneline yönlendirir
            if (uyelikler.Count > 0)
            {
                var aktifGecerli = user.AktifIsletmeId.HasValue &&
                    uyelikler.Any(u => u.IsletmeId == user.AktifIsletmeId.Value);
                if (!aktifGecerli)
                {
                    user.AktifIsletmeId = uyelikler[0].IsletmeId;
                }
            }
            else
            {
                // Super admin + 0 tenant: aktif yok
                user.AktifIsletmeId = null;
            }

            await db.SaveChangesAsync(ct);

            var token = jwt.TokenUret(user);
            var gun = int.Parse(cfg["Jwt:GunOmru"] ?? "30");
            var persistent = req.BeniHatirla ?? true;
            CookieEkle(http, token, gun, cfg, persistent);
            await audit.YazAsync("giris_basarili", "kullanici", user.Id, user.Id, email, ct: ct);

            var uyelikYanitlari = uyelikler.Select(u => new UyelikYaniti(
                u.IsletmeId, u.Isletme.MarkaAdi, u.Isletme.MarkaEmoji,
                u.Isletme.KullanimModu, u.Rol, u.Aktif)).ToList();

            return Results.Ok(new BenYaniti(
                user.Id, user.Email, user.AdSoyad, user.Rol, user.Cinsiyet,
                user.SuperAdmin, user.AktifIsletmeId, uyelikYanitlari,
                false, null));  // v19 - login'de impersonation olmaz
        });

        // 2. Token doğrula (frontend setup/reset sayfasında preflight)
        g.MapGet("/token/{token}", async (string token, AppDbContext db, CancellationToken ct) =>
        {
            var t = await db.AuthTokenlar.Include(x => x.Kullanici)
                .FirstOrDefaultAsync(x => x.Token == token, ct);
            if (t is null || t.Kullanildi || t.GecerlilikSonu < DateTimeOffset.UtcNow)
                return Results.BadRequest(new { hata = "Bağlantı geçersiz veya süresi dolmuş." });

            return Results.Ok(new TokenDogrulamaYaniti(t.Kullanici.Email, t.Kullanici.AdSoyad, t.Amac));
        });

        // 3. Şifre belirle (setup veya reset, aynı endpoint, token amac'ı belirler)
        g.MapPost("/sifre-belirle", async (
            SifreBelirleIstegi req, AppDbContext db, IPasswordService pwd,
            IAuditService audit, CancellationToken ct) =>
        {
            var t = await db.AuthTokenlar.Include(x => x.Kullanici)
                .FirstOrDefaultAsync(x => x.Token == req.Token, ct);
            if (t is null || t.Kullanildi || t.GecerlilikSonu < DateTimeOffset.UtcNow)
                return Results.BadRequest(new { hata = "Bağlantı geçersiz veya süresi dolmuş." });

            var (gecerli, hata) = pwd.PolitikaKontrol(req.YeniSifre);
            if (!gecerli) return Results.BadRequest(new { hata });

            t.Kullanici.SifreHash = pwd.Hashle(req.YeniSifre);
            t.Kullanici.SifreBelirlenmeZamani = DateTimeOffset.UtcNow;
            t.Kullanici.BasarisizDeneme = 0;
            t.Kullanici.KilitlenmeZamani = null;
            // v11 — Şifre yeniden belirlendiğinde kullanıcıyı otomatik aktifleştir.
            // Admin "şifre sıfırla" tıklayıp link gönderdiyse, bu deliberate bir eylem
            // — pasif kullanıcı tekrar erişebilir hale gelmelidir.
            t.Kullanici.Aktif = true;
            t.Kullanildi = true;
            t.KullanildiZamani = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);

            await audit.YazAsync(
                t.Amac == "setup" ? "sifre_belirlendi" : "sifre_sifirlandi",
                "kullanici", t.KullaniciId, t.KullaniciId, t.Kullanici.Email, ct: ct);

            return Results.Ok(new { mesaj = "Şifre belirlendi. Şimdi giriş yapabilirsin." });
        });

        // 4. Şifre sıfırlama iste (anonim, herkes deneyebilir)
        g.MapPost("/sifre-sifirla-iste", async (
            SifreSifirlaIstegi req, AppDbContext db,
            IEmailService email, IAuditService audit, IConfiguration cfg,
            CancellationToken ct) =>
        {
            var mail = (req.Email ?? "").Trim().ToLowerInvariant();
            var user = await db.Kullanicilar.FirstOrDefaultAsync(u => u.Email == mail, ct);

            // Bilgi sızdırma — varsa da yoksa da aynı yanıt
            if (user is null || !user.Aktif)
            {
                await audit.YazAsync("sifre_sifirla_istegi_bilinmeyen", aktorEmail: mail, ct: ct);
                return Results.Ok(new { mesaj = "Eğer hesap varsa, sıfırlama bağlantısı gönderildi." });
            }

            var token = TokenUret();
            db.AuthTokenlar.Add(new AuthToken
            {
                KullaniciId = user.Id,
                Token = token,
                Amac = "reset",
                GecerlilikSonu = DateTimeOffset.UtcNow.AddHours(1)
            });
            await db.SaveChangesAsync(ct);

            var frontend = cfg["FrontendBaseUrl"] ?? "http://localhost:3000";
            var link = $"{frontend}/sifre-sifirla?token={token}";
            await email.SifreSifirlamaMailGonderAsync(user.Email, user.AdSoyad, link, ct);

            await audit.YazAsync("sifre_sifirla_istegi", "kullanici", user.Id, aktorEmail: mail, ct: ct);
            return Results.Ok(new { mesaj = "Eğer hesap varsa, sıfırlama bağlantısı gönderildi." });
        });

        // 5. Şu anki kullanıcı — v15: tenant alanları + üyelikler dahil
        g.MapGet("/ben", async (IUserContext u, AppDbContext db, CancellationToken ct) =>
        {
            if (u.KullaniciId is null) return Results.Unauthorized();
            var user = await db.Kullanicilar
                .FirstOrDefaultAsync(x => x.Id == u.KullaniciId.Value, ct);
            if (user is null) return Results.Unauthorized();

            var uyelikler = await db.IsletmeUyelikleri
                .Include(x => x.Isletme)
                .Where(x => x.KullaniciId == user.Id && x.Aktif
                         && x.Isletme.Aktif && !x.Isletme.Silindi)
                .OrderBy(x => x.Isletme.MarkaAdi)
                .Select(x => new UyelikYaniti(
                    x.IsletmeId, x.Isletme.MarkaAdi, x.Isletme.MarkaEmoji,
                    x.Isletme.KullanimModu, x.Rol, x.Aktif))
                .ToListAsync(ct);

            // v19 Asama 9 - impersonation algilama: goruntule endpoint gecici JWT'de aktif_isletme_id=hedef
            // set eder; DB user.AktifIsletmeId degismez. JWT (u) ile DB (user) ayrismissa goruntuleme modu.
            var goruntulemeModu = user.SuperAdmin && u.AktifIsletmeId.HasValue
                && u.AktifIsletmeId != user.AktifIsletmeId;
            string? goruntulenenMarka = null;
            if (goruntulemeModu)
            {
                goruntulenenMarka = await db.Isletmeler
                    .Where(i => i.Id == u.AktifIsletmeId!.Value)
                    .Select(i => i.MarkaAdi)
                    .FirstOrDefaultAsync(ct);
            }
            // Etkin aktif tenant: impersonation'da hedef (JWT), normalde DB (95-109 duzeltmesi dahil)
            var etkinAktif = goruntulemeModu ? u.AktifIsletmeId : user.AktifIsletmeId;

            return Results.Ok(new BenYaniti(
                user.Id, user.Email, user.AdSoyad, user.Rol, user.Cinsiyet,
                user.SuperAdmin, etkinAktif, uyelikler,
                goruntulemeModu, goruntulenenMarka));
        }).RequireAuthorization();

        // 6. Çıkış
        g.MapPost("/cikis", async (HttpContext http, IAuditService audit,
            IUserContext u, IConfiguration cfg, CancellationToken ct) =>
        {
            var secure = bool.Parse(cfg["Cookie:Secure"] ?? "false");
            var domain = cfg["Cookie:Domain"];
            var opts = new CookieOptions
            {
                HttpOnly = true,
                Secure = secure,
                SameSite = secure ? SameSiteMode.None : SameSiteMode.Lax,
                Path = "/"
            };
            if (!string.IsNullOrEmpty(domain)) opts.Domain = domain;
            http.Response.Cookies.Delete("auth_token", opts);
            if (u.KullaniciId.HasValue)
                await audit.YazAsync("cikis", "kullanici", u.KullaniciId, ct: ct);
            return Results.Ok(new { mesaj = "Çıkış yapıldı." });
        });
    }

    public static string TokenUret() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))
            .Replace("+", "-").Replace("/", "_").Replace("=", "");

    public static void CookieEkle(HttpContext http, string token, int gun, IConfiguration cfg, bool persistent = true)
    {
        var secure = bool.Parse(cfg["Cookie:Secure"] ?? "false");
        var domain = cfg["Cookie:Domain"];
        var opts = new CookieOptions
        {
            HttpOnly = true,
            Secure = secure,
            SameSite = secure ? SameSiteMode.None : SameSiteMode.Lax,
            Path = "/"
        };
        // persistent true → Expires set, browser kapansa bile kalır
        // persistent false → Expires set edilmez, session cookie (browser kapanınca silinir)
        if (persistent)
        {
            opts.Expires = DateTimeOffset.UtcNow.AddDays(gun);
        }
        if (!string.IsNullOrEmpty(domain)) opts.Domain = domain;
        http.Response.Cookies.Append("auth_token", token, opts);
    }
}
