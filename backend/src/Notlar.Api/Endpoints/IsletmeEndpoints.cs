using System.Text.Json;
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

        // PATCH /api/isletmeler/aktif — marka & görünüm ayarlarını güncelle (v16)
        // Yetki: aktif tenant'ta 'admin' rolü. GoruntumeModu'da yazma yok (403).
        // PATCH semantiği: null gönderilen alan değişmez, dolu gönderilen güncellenir.
        g.MapPatch("/aktif", async (
            IsletmeAyarGuncelleIstegi req, AppDbContext db, IUserContext uc,
            IAuditService audit, CancellationToken ct) =>
        {
            // --- Yetki katmanları (defense in depth) ---
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);   // salt-okunur: yazma yasak
            var uid = uc.KullaniciId.Value;
            var tenantId = uc.AktifIsletmeId.Value;

            // Tenant-scoped rol: bu tenant'ta admin mi? (Kullanici.Rol DEPRECATED — uyelik rolu otorite)
            var uyelik = await db.IsletmeUyelikleri
                .FirstOrDefaultAsync(u => u.KullaniciId == uid
                                       && u.IsletmeId == tenantId && u.Aktif, ct);
            if (uyelik is null)
                return Results.NotFound(new { hata = "TENANT_BULUNAMADI", mesaj = "Aktif markaya uyelik bulunamadi." });
            if (uyelik.Rol != "admin") return Results.StatusCode(403);  // uye sadece okur

            var i = await db.Isletmeler.FindAsync(new object[] { tenantId }, ct);
            if (i is null) return Results.NotFound();

            // Izin verilen enum kumeleri (G.3/G.4 — ground truth: entity + migration default)
            var ikonSetleri = new[] { "kalp", "klasik", "ekip", "aile", "tatil" };
            var mailTonlari = new[] { "samimi", "profesyonel" };

            // --- Pass 1: validasyon (henuz mutasyon yok — biri hatali olursa hicbiri yazilmaz) ---
            string? yMarkaAdi = null, yMarkaEmoji = null, yIkonSeti = null;
            string? yKarsilamaBasligi = null, yKarsilamaAltMetni = null, ySayacBasligi = null;
            string? yMailImza = null, yMailTonu = null;

            if (req.MarkaAdi is not null)
            {
                yMarkaAdi = req.MarkaAdi.Trim();
                if (yMarkaAdi.Length is < 1 or > 80)
                    return Results.BadRequest(new { hata = "MARKA_ADI_GECERSIZ", mesaj = "Marka adi 1-80 karakter olmali." });
            }
            if (req.MarkaEmoji is not null)
            {
                yMarkaEmoji = req.MarkaEmoji.Trim();
                if (yMarkaEmoji.Length is < 1 or > 10)
                    return Results.BadRequest(new { hata = "MARKA_EMOJI_GECERSIZ", mesaj = "Marka emoji 1-10 karakter olmali." });
            }
            if (req.IkonSeti is not null)
            {
                yIkonSeti = req.IkonSeti.Trim();
                if (!ikonSetleri.Contains(yIkonSeti))
                    return Results.BadRequest(new { hata = "IKON_SETI_GECERSIZ", mesaj = "Gecersiz ikon seti." });
            }
            if (req.KarsilamaBasligi is not null)
            {
                yKarsilamaBasligi = req.KarsilamaBasligi.Trim();
                if (yKarsilamaBasligi.Length is < 1 or > 120)
                    return Results.BadRequest(new { hata = "KARSILAMA_BASLIGI_GECERSIZ", mesaj = "Karsilama basligi 1-120 karakter olmali." });
            }
            if (req.KarsilamaAltMetni is not null)
            {
                yKarsilamaAltMetni = req.KarsilamaAltMetni.Trim();
                if (yKarsilamaAltMetni.Length is < 1 or > 280)
                    return Results.BadRequest(new { hata = "KARSILAMA_ALT_METNI_GECERSIZ", mesaj = "Karsilama alt metni 1-280 karakter olmali." });
            }
            if (req.SayacBasligi is not null)
            {
                ySayacBasligi = req.SayacBasligi.Trim();
                if (ySayacBasligi.Length is < 1 or > 60)
                    return Results.BadRequest(new { hata = "SAYAC_BASLIGI_GECERSIZ", mesaj = "Sayac basligi 1-60 karakter olmali." });
            }
            if (req.MailImza is not null)
            {
                yMailImza = req.MailImza.Trim();
                if (yMailImza.Length is < 1 or > 80)
                    return Results.BadRequest(new { hata = "MAIL_IMZA_GECERSIZ", mesaj = "Mail imza 1-80 karakter olmali." });
            }
            if (req.MailTonu is not null)
            {
                yMailTonu = req.MailTonu.Trim();
                if (!mailTonlari.Contains(yMailTonu))
                    return Results.BadRequest(new { hata = "MAIL_TONU_GECERSIZ", mesaj = "Gecersiz mail tonu." });
            }

            // --- Pass 2: diff + uygula (degisen alan eski/yeni snapshot) ---
            var degisenler = new Dictionary<string, object>();
            if (yMarkaAdi is not null && yMarkaAdi != i.MarkaAdi)
            { degisenler["MarkaAdi"] = new { eski = i.MarkaAdi, yeni = yMarkaAdi }; i.MarkaAdi = yMarkaAdi; }
            if (yMarkaEmoji is not null && yMarkaEmoji != i.MarkaEmoji)
            { degisenler["MarkaEmoji"] = new { eski = i.MarkaEmoji, yeni = yMarkaEmoji }; i.MarkaEmoji = yMarkaEmoji; }
            if (yIkonSeti is not null && yIkonSeti != i.IkonSeti)
            { degisenler["IkonSeti"] = new { eski = i.IkonSeti, yeni = yIkonSeti }; i.IkonSeti = yIkonSeti; }
            if (yKarsilamaBasligi is not null && yKarsilamaBasligi != i.KarsilamaBasligi)
            { degisenler["KarsilamaBasligi"] = new { eski = i.KarsilamaBasligi, yeni = yKarsilamaBasligi }; i.KarsilamaBasligi = yKarsilamaBasligi; }
            if (yKarsilamaAltMetni is not null && yKarsilamaAltMetni != i.KarsilamaAltMetni)
            { degisenler["KarsilamaAltMetni"] = new { eski = i.KarsilamaAltMetni, yeni = yKarsilamaAltMetni }; i.KarsilamaAltMetni = yKarsilamaAltMetni; }
            if (req.SayacAktif is not null && req.SayacAktif.Value != i.SayacAktif)
            { degisenler["SayacAktif"] = new { eski = i.SayacAktif, yeni = req.SayacAktif.Value }; i.SayacAktif = req.SayacAktif.Value; }
            if (ySayacBasligi is not null && ySayacBasligi != i.SayacBasligi)
            { degisenler["SayacBasligi"] = new { eski = i.SayacBasligi, yeni = ySayacBasligi }; i.SayacBasligi = ySayacBasligi; }
            if (req.SayacHedefTarihi is not null && req.SayacHedefTarihi != i.SayacHedefTarihi)
            { degisenler["SayacHedefTarihi"] = new { eski = i.SayacHedefTarihi, yeni = req.SayacHedefTarihi }; i.SayacHedefTarihi = req.SayacHedefTarihi; }
            if (yMailImza is not null && yMailImza != i.MailImza)
            { degisenler["MailImza"] = new { eski = i.MailImza, yeni = yMailImza }; i.MailImza = yMailImza; }
            if (yMailTonu is not null && yMailTonu != i.MailTonu)
            { degisenler["MailTonu"] = new { eski = i.MailTonu, yeni = yMailTonu }; i.MailTonu = yMailTonu; }

            // Degisiklik yoksa: yazma + audit yok, mevcut ayarlari don
            if (degisenler.Count > 0)
            {
                var json = JsonSerializer.Serialize(degisenler);
                // audit.YazAsync tek SaveChangesAsync ile isletme update'i + audit satirini
                // ayni transaction'da yazar (atomik).
                await audit.YazAsync("isletme_ayar_guncelle", "isletme", tenantId,
                    degisenAlanlar: json, ct: ct);
            }

            return Results.Ok(new IsletmeYaniti(
                i.Id, i.MarkaAdi, i.MarkaEmoji, i.IkonSeti,
                i.KarsilamaBasligi, i.KarsilamaAltMetni,
                i.SayacAktif, i.SayacBasligi, i.SayacHedefTarihi,
                i.MailImza, i.MailTonu, i.KullanimModu));
        });
    }
}
