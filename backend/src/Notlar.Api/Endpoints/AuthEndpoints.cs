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

            if (user is null || !user.Aktif || string.IsNullOrEmpty(user.SifreHash))
            {
                await audit.YazAsync("giris_basarisiz", aktorEmail: email, detay: "Kullanıcı yok veya şifre belirlenmemiş", ct: ct);
                return Results.BadRequest(new { hata = "Email veya şifre hatalı." });
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
            await db.SaveChangesAsync(ct);

            var token = jwt.TokenUret(user);
            var gun = int.Parse(cfg["Jwt:GunOmru"] ?? "30");
            CookieEkle(http, token, gun, cfg);
            await audit.YazAsync("giris_basarili", "kullanici", user.Id, user.Id, email, ct: ct);

            return Results.Ok(new BenYaniti(user.Id, user.Email, user.AdSoyad, user.Rol));
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

        // 5. Şu anki kullanıcı
        g.MapGet("/ben", (IUserContext u) =>
        {
            if (u.KullaniciId is null) return Results.Unauthorized();
            return Results.Ok(new BenYaniti(u.KullaniciId.Value, u.Email!, u.AdSoyad!, u.Rol!));
        }).RequireAuthorization();

        // 6. Çıkış
        g.MapPost("/cikis", async (HttpContext http, IAuditService audit, IUserContext u, CancellationToken ct) =>
        {
            http.Response.Cookies.Delete("auth_token");
            if (u.KullaniciId.HasValue)
                await audit.YazAsync("cikis", "kullanici", u.KullaniciId, ct: ct);
            return Results.Ok(new { mesaj = "Çıkış yapıldı." });
        });
    }

    public static string TokenUret() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))
            .Replace("+", "-").Replace("/", "_").Replace("=", "");

    public static void CookieEkle(HttpContext http, string token, int gun, IConfiguration cfg)
    {
        var secure = bool.Parse(cfg["Cookie:Secure"] ?? "false");
        var domain = cfg["Cookie:Domain"];
        var opts = new CookieOptions
        {
            HttpOnly = true,
            Secure = secure,
            SameSite = secure ? SameSiteMode.None : SameSiteMode.Lax,
            Expires = DateTimeOffset.UtcNow.AddDays(gun),
            Path = "/"
        };
        if (!string.IsNullOrEmpty(domain)) opts.Domain = domain;
        http.Response.Cookies.Append("auth_token", token, opts);
    }
}
