using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using Notlar.Api.Models;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

public static class NoteEndpoints
{
    public static void MapNoteEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/notlar").WithTags("Notlar").RequireAuthorization();

        // LIST — filtreli (klasor, silindi, tamamlandi)
        g.MapGet("/", async (
            AppDbContext db, Guid? klasor, bool? tamamlandi, bool? silindi,
            CancellationToken ct) =>
        {
            var sorgu = db.Notlar.AsQueryable();
            sorgu = silindi == true ? sorgu.Where(n => n.Silindi) : sorgu.Where(n => !n.Silindi);
            if (klasor.HasValue) sorgu = sorgu.Where(n => n.KlasorId == klasor.Value);
            if (tamamlandi.HasValue) sorgu = sorgu.Where(n => n.Tamamlandi == tamamlandi.Value);

            var list = await sorgu
                .Include(n => n.OlusturanKullanici)
                .Include(n => n.TamamlayanKullanici)
                .Include(n => n.Klasor)
                .OrderByDescending(n => n.GuncellemeZamani)
                .Select(n => MapYanit(n))
                .ToListAsync(ct);

            return Results.Ok(list);
        });

        // GET ONE
        g.MapGet("/{id:guid}", async (Guid id, AppDbContext db, CancellationToken ct) =>
        {
            var n = await db.Notlar
                .Include(x => x.OlusturanKullanici)
                .Include(x => x.TamamlayanKullanici)
                .Include(x => x.Klasor)
                .FirstOrDefaultAsync(x => x.Id == id, ct);
            return n is null ? Results.NotFound() : Results.Ok(MapYanit(n));
        });

        // CREATE
        g.MapPost("/", async (
            NotOlusturIstegi req, AppDbContext db,
            IUserContext uc, IAuditService audit, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Baslik))
                return Results.BadRequest(new { hata = "Başlık zorunlu." });
            if (uc.KullaniciId is null) return Results.Unauthorized();

            var n = new Not
            {
                Baslik = req.Baslik.Trim(),
                Icerik = req.Icerik?.Trim(),
                KlasorId = req.KlasorId,
                OlusturanKullaniciId = uc.KullaniciId.Value
            };

            // Hatırlatıcı (opsiyonel) — toggle açıksa 3 alan da dolu olmalı
            if (req.HatirlatmaZamani.HasValue)
            {
                if (string.IsNullOrWhiteSpace(req.HatirlatmaKime) || string.IsNullOrWhiteSpace(req.HatirlatmaSekli))
                    return Results.BadRequest(new { hata = "Hatırlatıcı için kime ve şekil zorunlu." });
                if (!new[] { "askima", "bana", "ikimize" }.Contains(req.HatirlatmaKime))
                    return Results.BadRequest(new { hata = "HatirlatmaKime geçersiz." });
                if (!new[] { "uygulama", "email", "her_ikisi" }.Contains(req.HatirlatmaSekli))
                    return Results.BadRequest(new { hata = "HatirlatmaSekli geçersiz." });
                if (req.HatirlatmaZamani.Value <= DateTimeOffset.UtcNow)
                    return Results.BadRequest(new { hata = "Hatırlatma zamanı gelecekte olmalı." });

                n.HatirlatmaZamani = req.HatirlatmaZamani;
                n.HatirlatmaKime = req.HatirlatmaKime;
                n.HatirlatmaSekli = req.HatirlatmaSekli;
                n.HatirlatmaKuranKullaniciId = uc.KullaniciId.Value;
            }

            db.Notlar.Add(n);

            db.NotGecmisleri.Add(new NotGecmisi
            {
                NotId = n.Id,
                Eylem = "olusturuldu",
                YeniDeger = JsonSerializer.Serialize(new { n.Baslik, n.Icerik, n.KlasorId }),
                YapanKullaniciId = uc.KullaniciId.Value
            });
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("not_olusturuldu", "not", n.Id, detay: n.Baslik, ct: ct);

            var loaded = await db.Notlar
                .Include(x => x.OlusturanKullanici)
                .Include(x => x.Klasor)
                .FirstAsync(x => x.Id == n.Id, ct);
            return Results.Created($"/api/notlar/{n.Id}", MapYanit(loaded));
        });

        // UPDATE
        g.MapPut("/{id:guid}", async (
            Guid id, NotGuncelleIstegi req, AppDbContext db,
            IUserContext uc, IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            var n = await db.Notlar
                .Include(x => x.OlusturanKullanici)
                .Include(x => x.Klasor)
                .FirstOrDefaultAsync(x => x.Id == id && !x.Silindi, ct);
            if (n is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(req.Baslik))
                return Results.BadRequest(new { hata = "Başlık zorunlu." });

            var eski = JsonSerializer.Serialize(new { n.Baslik, n.Icerik, n.KlasorId });
            n.Baslik = req.Baslik.Trim();
            n.Icerik = req.Icerik?.Trim();
            n.KlasorId = req.KlasorId;
            n.GuncellemeZamani = DateTimeOffset.UtcNow;

            // Hatırlatıcı güncelleme
            if (req.HatirlatmaSil)
            {
                // Toggle kapatıldı — tüm hatırlatma temizle
                n.HatirlatmaZamani = null;
                n.HatirlatmaKime = null;
                n.HatirlatmaSekli = null;
                n.HatirlatmaGonderildiMi = false;
                n.HatirlatmaGonderimZamani = null;
                n.HatirlatmaKuranKullaniciId = null;
            }
            else if (req.HatirlatmaZamani.HasValue)
            {
                if (string.IsNullOrWhiteSpace(req.HatirlatmaKime) || string.IsNullOrWhiteSpace(req.HatirlatmaSekli))
                    return Results.BadRequest(new { hata = "Hatırlatıcı için kime ve şekil zorunlu." });
                if (!new[] { "askima", "bana", "ikimize" }.Contains(req.HatirlatmaKime))
                    return Results.BadRequest(new { hata = "HatirlatmaKime geçersiz." });
                if (!new[] { "uygulama", "email", "her_ikisi" }.Contains(req.HatirlatmaSekli))
                    return Results.BadRequest(new { hata = "HatirlatmaSekli geçersiz." });

                // Aynı zamana tekrar set edilirse gönderildi flag'i sıfırlanır (re-arming)
                var zamanDegisti = n.HatirlatmaZamani != req.HatirlatmaZamani;
                n.HatirlatmaZamani = req.HatirlatmaZamani;
                n.HatirlatmaKime = req.HatirlatmaKime;
                n.HatirlatmaSekli = req.HatirlatmaSekli;
                if (zamanDegisti)
                {
                    n.HatirlatmaGonderildiMi = false;
                    n.HatirlatmaGonderimZamani = null;
                }
                n.HatirlatmaKuranKullaniciId ??= uc.KullaniciId.Value;
            }

            var yeni = JsonSerializer.Serialize(new { n.Baslik, n.Icerik, n.KlasorId });

            db.NotGecmisleri.Add(new NotGecmisi
            {
                NotId = n.Id,
                Eylem = "duzenlendi",
                EskiDeger = eski,
                YeniDeger = yeni,
                Aciklama = string.IsNullOrWhiteSpace(req.DegisiklikAciklamasi) ? null : req.DegisiklikAciklamasi.Trim(),
                YapanKullaniciId = uc.KullaniciId.Value
            });
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("not_guncellendi", "not", n.Id, detay: n.Baslik, ct: ct);
            return Results.Ok(MapYanit(n));
        });

        // TAMAMLA (açıklama zorunlu)
        g.MapPost("/{id:guid}/tamamla", async (
            Guid id, NotTamamlaIstegi req, AppDbContext db,
            IUserContext uc, IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (string.IsNullOrWhiteSpace(req.TamamlanmaAciklamasi))
                return Results.BadRequest(new { hata = "Tamamlanma açıklaması zorunlu." });

            var n = await db.Notlar
                .Include(x => x.OlusturanKullanici)
                .Include(x => x.Klasor)
                .FirstOrDefaultAsync(x => x.Id == id && !x.Silindi, ct);
            if (n is null) return Results.NotFound();
            if (n.Tamamlandi) return Results.BadRequest(new { hata = "Not zaten tamamlandı." });

            n.Tamamlandi = true;
            n.TamamlanmaAciklamasi = req.TamamlanmaAciklamasi.Trim();
            n.TamamlanmaZamani = DateTimeOffset.UtcNow;
            n.TamamlayanKullaniciId = uc.KullaniciId.Value;
            n.GuncellemeZamani = DateTimeOffset.UtcNow;

            db.NotGecmisleri.Add(new NotGecmisi
            {
                NotId = n.Id,
                Eylem = "tamamlandi",
                Aciklama = req.TamamlanmaAciklamasi.Trim(),
                YapanKullaniciId = uc.KullaniciId.Value
            });
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("not_tamamlandi", "not", n.Id, detay: n.Baslik, ct: ct);
            var loaded = await db.Notlar
                .Include(x => x.OlusturanKullanici)
                .Include(x => x.TamamlayanKullanici)
                .Include(x => x.Klasor)
                .FirstAsync(x => x.Id == n.Id, ct);
            return Results.Ok(MapYanit(loaded));
        });

        // YENİDEN AÇ (tamamlandı'yı geri al)
        g.MapPost("/{id:guid}/yeniden-ac", async (
            Guid id, AppDbContext db, IUserContext uc,
            IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            var n = await db.Notlar
                .Include(x => x.OlusturanKullanici)
                .Include(x => x.Klasor)
                .FirstOrDefaultAsync(x => x.Id == id && !x.Silindi, ct);
            if (n is null) return Results.NotFound();
            if (!n.Tamamlandi) return Results.BadRequest(new { hata = "Not zaten açık." });

            n.Tamamlandi = false;
            n.TamamlanmaAciklamasi = null;
            n.TamamlanmaZamani = null;
            n.TamamlayanKullaniciId = null;
            n.GuncellemeZamani = DateTimeOffset.UtcNow;

            db.NotGecmisleri.Add(new NotGecmisi
            {
                NotId = n.Id,
                Eylem = "yeniden_acildi",
                YapanKullaniciId = uc.KullaniciId.Value
            });
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("not_yeniden_acildi", "not", n.Id, detay: n.Baslik, ct: ct);
            return Results.Ok(MapYanit(n));
        });

        // SOFT DELETE
        g.MapDelete("/{id:guid}", async (
            Guid id, AppDbContext db, IUserContext uc,
            IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            var n = await db.Notlar.FirstOrDefaultAsync(x => x.Id == id && !x.Silindi, ct);
            if (n is null) return Results.NotFound();

            n.Silindi = true;
            n.SilinmeZamani = DateTimeOffset.UtcNow;
            n.SilenKullaniciId = uc.KullaniciId.Value;

            db.NotGecmisleri.Add(new NotGecmisi
            {
                NotId = n.Id,
                Eylem = "silindi",
                YapanKullaniciId = uc.KullaniciId.Value
            });
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("not_silindi", "not", n.Id, detay: n.Baslik, ct: ct);
            return Results.NoContent();
        });

        // GERİ YÜKLE (çöp kutusundan)
        g.MapPost("/{id:guid}/geri-yukle", async (
            Guid id, AppDbContext db, IUserContext uc,
            IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            var n = await db.Notlar
                .Include(x => x.OlusturanKullanici).Include(x => x.Klasor)
                .FirstOrDefaultAsync(x => x.Id == id && x.Silindi, ct);
            if (n is null) return Results.NotFound();

            n.Silindi = false;
            n.SilinmeZamani = null;
            n.SilenKullaniciId = null;

            db.NotGecmisleri.Add(new NotGecmisi
            {
                NotId = n.Id,
                Eylem = "geri_alindi",
                YapanKullaniciId = uc.KullaniciId.Value
            });
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("not_geri_yuklendi", "not", n.Id, detay: n.Baslik, ct: ct);
            return Results.Ok(MapYanit(n));
        });

        // GEÇMİŞ (detay göz)
        g.MapGet("/{id:guid}/gecmis", async (Guid id, AppDbContext db, CancellationToken ct) =>
        {
            var list = await db.NotGecmisleri
                .Where(g => g.NotId == id)
                .Include(g => g.YapanKullanici)
                .OrderBy(g => g.YapilisZamani)
                .Select(g => new NotGecmisiYaniti(
                    g.Id, g.Eylem, g.Aciklama,
                    g.EskiDeger, g.YeniDeger,
                    g.YapanKullanici.AdSoyad, g.YapilisZamani))
                .ToListAsync(ct);
            return Results.Ok(list);
        });
    }

    private static NotYaniti MapYanit(Not n) => new(
        n.Id, n.Baslik, n.Icerik, n.Tamamlandi,
        n.TamamlanmaAciklamasi, n.TamamlanmaZamani,
        n.TamamlayanKullanici?.AdSoyad,
        n.KlasorId, n.Klasor?.Ad,
        n.OlusturanKullaniciId, n.OlusturanKullanici.AdSoyad,
        n.OlusturmaZamani, n.GuncellemeZamani,
        n.Silindi, n.SilinmeZamani,
        n.HatirlatmaZamani, n.HatirlatmaKime, n.HatirlatmaSekli,
        n.HatirlatmaGonderildiMi);
}
