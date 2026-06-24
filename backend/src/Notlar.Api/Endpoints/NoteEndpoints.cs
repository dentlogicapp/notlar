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

        // LIST — tenant-scoped + filtreli (klasor, silindi, tamamlandi)
        g.MapGet("/", async (
            AppDbContext db, IUserContext uc, Guid? klasor, bool? tamamlandi, bool? silindi,
            CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tenantId = uc.AktifIsletmeId.Value;

            var sorgu = db.Notlar.Where(n => n.IsletmeId == tenantId);  // v15
            sorgu = silindi == true ? sorgu.Where(n => n.Silindi) : sorgu.Where(n => !n.Silindi);
            if (klasor.HasValue) sorgu = sorgu.Where(n => n.KlasorId == klasor.Value);
            if (tamamlandi.HasValue) sorgu = sorgu.Where(n => n.Tamamlandi == tamamlandi.Value);

            var notlar = await sorgu
                .Include(n => n.OlusturanKullanici)
                .Include(n => n.TamamlayanKullanici)
                .Include(n => n.Klasor)
                .OrderByDescending(n => n.GuncellemeZamani)
                .ToListAsync(ct);

            var kilitSuresi = TimeSpan.FromSeconds(45);
            var simdi = DateTimeOffset.UtcNow;
            var aktifKilitIds = notlar
                .Where(n => n.KilitKullaniciId.HasValue
                         && n.KilitKullaniciId != uc.KullaniciId
                         && n.KilitZamani.HasValue
                         && (simdi - n.KilitZamani.Value) <= kilitSuresi)
                .Select(n => n.KilitKullaniciId!.Value)
                .Distinct()
                .ToList();

            var kilitSahipleri = aktifKilitIds.Count > 0
                ? await db.Kullanicilar
                    .Where(u => aktifKilitIds.Contains(u.Id))
                    .ToDictionaryAsync(u => u.Id, u => u.AdSoyad, ct)
                : new Dictionary<Guid, string>();

            var list = notlar.Select(n =>
            {
                string? sahibi = null;
                if (n.KilitKullaniciId.HasValue
                    && n.KilitKullaniciId != uc.KullaniciId
                    && n.KilitZamani.HasValue
                    && (simdi - n.KilitZamani.Value) <= kilitSuresi)
                {
                    kilitSahipleri.TryGetValue(n.KilitKullaniciId.Value, out sahibi);
                }
                return MapYanit(n, sahibi);
            }).ToList();

            return Results.Ok(list);
        });

        // GET ONE — tenant-scoped
        g.MapGet("/{id:guid}", async (Guid id, AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tenantId = uc.AktifIsletmeId.Value;

            var n = await db.Notlar
                .Include(x => x.OlusturanKullanici)
                .Include(x => x.TamamlayanKullanici)
                .Include(x => x.Klasor)
                .FirstOrDefaultAsync(x => x.Id == id && x.IsletmeId == tenantId, ct);
            return n is null ? Results.NotFound() : Results.Ok(MapYanit(n));
        });

        // CREATE — tenant-scoped
        g.MapPost("/", async (
            NotOlusturIstegi req, AppDbContext db,
            IUserContext uc, IAuditService audit, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Baslik))
                return Results.BadRequest(new { hata = "Başlık zorunlu." });
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);

            var tenantId = uc.AktifIsletmeId.Value;

            // KlasorId varsa tenant'a ait olmalı
            if (req.KlasorId.HasValue)
            {
                var klasor = await db.Klasorler
                    .FirstOrDefaultAsync(k => k.Id == req.KlasorId.Value && k.IsletmeId == tenantId && !k.Silindi, ct);
                if (klasor is null) return Results.BadRequest(new { hata = "Klasör bulunamadı." });
                // v19 B1 - sistem klasorune (Tamamlananlar) manuel not EKLENEMEZ; not ancak tamamlandiginda buraya tasinir (defense in depth: frontend gizler + backend reddeder).
                if (klasor.SistemMi)
                    return Results.BadRequest(new { hata = "SISTEM_KLASORU_NOT_EKLENEMEZ", mesaj = "Bu bir sistem klasörü; doğrudan not eklenemez. Not ancak tamamlandığında buraya taşınır." });
            }

            var n = new Not
            {
                Baslik = req.Baslik.Trim(),
                Icerik = req.Icerik?.Trim(),
                KlasorId = req.KlasorId,
                OlusturanKullaniciId = uc.KullaniciId.Value,
                IsletmeId = tenantId,  // v15
            };

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
                IsletmeId = tenantId,  // v15
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

        // UPDATE — tenant-scoped
        g.MapPut("/{id:guid}", async (
            Guid id, NotGuncelleIstegi req, AppDbContext db,
            IUserContext uc, IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);

            var tenantId = uc.AktifIsletmeId.Value;
            var n = await db.Notlar
                .Include(x => x.OlusturanKullanici)
                .Include(x => x.Klasor)
                .FirstOrDefaultAsync(x => x.Id == id && !x.Silindi && x.IsletmeId == tenantId, ct);
            if (n is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(req.Baslik))
                return Results.BadRequest(new { hata = "Başlık zorunlu." });

            // Hedef klasör de tenant'a ait olmalı
            if (req.KlasorId.HasValue)
            {
                var klasor = await db.Klasorler
                    .FirstOrDefaultAsync(k => k.Id == req.KlasorId.Value && k.IsletmeId == tenantId && !k.Silindi, ct);
                if (klasor is null) return Results.BadRequest(new { hata = "Klasör bulunamadı." });
                // v19 B1 - sistem klasorune (Tamamlananlar) not TASINAMAZ; sadece tamamlama tasir.
                if (klasor.SistemMi)
                    return Results.BadRequest(new { hata = "SISTEM_KLASORU_NOT_TASINAMAZ", mesaj = "Bu bir sistem klasörü; not buraya taşınamaz. Not ancak tamamlandığında buraya taşınır." });
            }

            var kilitSahibi = await LockEndpoints.KilitBaskasiMi(
                db, n.KilitKullaniciId, n.KilitZamani, uc.KullaniciId.Value, ct);
            if (kilitSahibi is not null)
                return Results.Json(new { hata = $"{kilitSahibi} şu anda bu notu düzenliyor." }, statusCode: 409);

            var eski = JsonSerializer.Serialize(new { n.Baslik, n.Icerik, n.KlasorId });
            n.Baslik = req.Baslik.Trim();
            n.Icerik = req.Icerik?.Trim();
            n.KlasorId = req.KlasorId;
            n.GuncellemeZamani = DateTimeOffset.UtcNow;

            if (req.HatirlatmaSil)
            {
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
                IsletmeId = tenantId,  // v15
                Eylem = "duzenlendi",
                EskiDeger = eski,
                YeniDeger = yeni,
                Aciklama = string.IsNullOrWhiteSpace(req.DegisiklikAciklamasi) ? null : req.DegisiklikAciklamasi.Trim(),
                YapanKullaniciId = uc.KullaniciId.Value
            });

            if (n.KilitKullaniciId == uc.KullaniciId.Value)
            {
                n.KilitKullaniciId = null;
                n.KilitZamani = null;
            }

            await db.SaveChangesAsync(ct);

            await audit.YazAsync("not_guncellendi", "not", n.Id, detay: n.Baslik, ct: ct);
            return Results.Ok(MapYanit(n));
        });

        // TAMAMLA — tenant-scoped
        g.MapPost("/{id:guid}/tamamla", async (
            Guid id, NotTamamlaIstegi req, AppDbContext db,
            IUserContext uc, IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);
            if (string.IsNullOrWhiteSpace(req.TamamlanmaAciklamasi))
                return Results.BadRequest(new { hata = "Tamamlanma açıklaması zorunlu." });

            var tenantId = uc.AktifIsletmeId.Value;
            var n = await db.Notlar
                .Include(x => x.OlusturanKullanici)
                .Include(x => x.Klasor)
                .FirstOrDefaultAsync(x => x.Id == id && !x.Silindi && x.IsletmeId == tenantId, ct);
            if (n is null) return Results.NotFound();
            if (n.Tamamlandi) return Results.BadRequest(new { hata = "Not zaten tamamlandı." });

            var kilitSahibi = await LockEndpoints.KilitBaskasiMi(
                db, n.KilitKullaniciId, n.KilitZamani, uc.KullaniciId.Value, ct);
            if (kilitSahibi is not null)
                return Results.Json(new { hata = $"{kilitSahibi} şu anda bu notu düzenliyor." }, statusCode: 409);

            n.Tamamlandi = true;
            n.TamamlanmaAciklamasi = req.TamamlanmaAciklamasi.Trim();
            n.TamamlanmaZamani = DateTimeOffset.UtcNow;
            n.TamamlayanKullaniciId = uc.KullaniciId.Value;
            n.GuncellemeZamani = DateTimeOffset.UtcNow;

            n.EskiKlasorId = n.KlasorId;
            var tamamlananlar = await db.Klasorler
                .Where(k => k.SistemMi && k.Ad == "Tamamlananlar" && k.IsletmeId == tenantId)
                .FirstOrDefaultAsync(ct);
            if (tamamlananlar is not null)
                n.KlasorId = tamamlananlar.Id;

            db.NotGecmisleri.Add(new NotGecmisi
            {
                NotId = n.Id,
                IsletmeId = tenantId,  // v15
                Eylem = "tamamlandi",
                Aciklama = req.TamamlanmaAciklamasi.Trim(),
                YapanKullaniciId = uc.KullaniciId.Value
            });

            n.KilitKullaniciId = null;
            n.KilitZamani = null;

            await db.SaveChangesAsync(ct);

            await audit.YazAsync("not_tamamlandi", "not", n.Id, detay: n.Baslik, ct: ct);
            var loaded = await db.Notlar
                .Include(x => x.OlusturanKullanici)
                .Include(x => x.TamamlayanKullanici)
                .Include(x => x.Klasor)
                .FirstAsync(x => x.Id == n.Id, ct);
            return Results.Ok(MapYanit(loaded));
        });

        // YENİDEN AÇ — tenant-scoped
        g.MapPost("/{id:guid}/yeniden-ac", async (
            Guid id, AppDbContext db, IUserContext uc,
            IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);

            var tenantId = uc.AktifIsletmeId.Value;
            var n = await db.Notlar
                .Include(x => x.OlusturanKullanici)
                .Include(x => x.Klasor)
                .FirstOrDefaultAsync(x => x.Id == id && !x.Silindi && x.IsletmeId == tenantId, ct);
            if (n is null) return Results.NotFound();
            if (!n.Tamamlandi) return Results.BadRequest(new { hata = "Not zaten açık." });

            n.Tamamlandi = false;
            n.TamamlanmaAciklamasi = null;
            n.TamamlanmaZamani = null;
            n.TamamlayanKullaniciId = null;
            n.GuncellemeZamani = DateTimeOffset.UtcNow;

            n.KlasorId = n.EskiKlasorId;
            n.EskiKlasorId = null;

            db.NotGecmisleri.Add(new NotGecmisi
            {
                NotId = n.Id,
                IsletmeId = tenantId,  // v15
                Eylem = "yeniden_acildi",
                YapanKullaniciId = uc.KullaniciId.Value
            });
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("not_yeniden_acildi", "not", n.Id, detay: n.Baslik, ct: ct);
            var loaded = await db.Notlar
                .Include(x => x.OlusturanKullanici)
                .Include(x => x.Klasor)
                .FirstAsync(x => x.Id == n.Id, ct);
            return Results.Ok(MapYanit(loaded));
        });

        // SOFT DELETE — tenant-scoped
        g.MapDelete("/{id:guid}", async (
            Guid id, AppDbContext db, IUserContext uc,
            IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);

            var tenantId = uc.AktifIsletmeId.Value;
            var n = await db.Notlar.FirstOrDefaultAsync(
                x => x.Id == id && !x.Silindi && x.IsletmeId == tenantId, ct);
            if (n is null) return Results.NotFound();

            n.Silindi = true;
            n.SilinmeZamani = DateTimeOffset.UtcNow;
            n.SilenKullaniciId = uc.KullaniciId.Value;

            db.NotGecmisleri.Add(new NotGecmisi
            {
                NotId = n.Id,
                IsletmeId = tenantId,  // v15
                Eylem = "silindi",
                YapanKullaniciId = uc.KullaniciId.Value
            });
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("not_silindi", "not", n.Id, detay: n.Baslik, ct: ct);
            return Results.NoContent();
        });

        // GERİ YÜKLE — tenant-scoped
        g.MapPost("/{id:guid}/geri-yukle", async (
            Guid id, AppDbContext db, IUserContext uc,
            IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);

            var tenantId = uc.AktifIsletmeId.Value;
            var n = await db.Notlar
                .Include(x => x.OlusturanKullanici).Include(x => x.Klasor)
                .FirstOrDefaultAsync(x => x.Id == id && x.Silindi && x.IsletmeId == tenantId, ct);
            if (n is null) return Results.NotFound();

            n.Silindi = false;
            n.SilinmeZamani = null;
            n.SilenKullaniciId = null;

            db.NotGecmisleri.Add(new NotGecmisi
            {
                NotId = n.Id,
                IsletmeId = tenantId,  // v15
                Eylem = "geri_alindi",
                YapanKullaniciId = uc.KullaniciId.Value
            });
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("not_geri_yuklendi", "not", n.Id, detay: n.Baslik, ct: ct);
            return Results.Ok(MapYanit(n));
        });

        // GEÇMİŞ — tenant-scoped
        g.MapGet("/{id:guid}/gecmis", async (Guid id, AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tenantId = uc.AktifIsletmeId.Value;

            // Önce notun bu tenant'a ait olduğunu doğrula
            var notVar = await db.Notlar.AnyAsync(n => n.Id == id && n.IsletmeId == tenantId, ct);
            if (!notVar) return Results.NotFound();

            var list = await db.NotGecmisleri
                .Where(gec => gec.NotId == id && gec.IsletmeId == tenantId)
                .Include(gec => gec.YapanKullanici)
                .OrderBy(gec => gec.YapilisZamani)
                .Select(gec => new NotGecmisiYaniti(
                    gec.Id, gec.Eylem, gec.Aciklama,
                    gec.EskiDeger, gec.YeniDeger,
                    gec.YapanKullanici.AdSoyad, gec.YapilisZamani))
                .ToListAsync(ct);
            return Results.Ok(list);
        });
    }

    private static NotYaniti MapYanit(Not n, string? kilitSahibiAdi = null) => new(
        n.Id, n.Baslik, n.Icerik, n.Tamamlandi,
        n.TamamlanmaAciklamasi, n.TamamlanmaZamani,
        n.TamamlayanKullanici?.AdSoyad,
        n.KlasorId, n.Klasor?.Ad,
        n.OlusturanKullaniciId, n.OlusturanKullanici.AdSoyad,
        n.OlusturmaZamani, n.GuncellemeZamani,
        n.Silindi, n.SilinmeZamani,
        n.HatirlatmaZamani, n.HatirlatmaKime, n.HatirlatmaSekli,
        n.HatirlatmaGonderildiMi,
        kilitSahibiAdi,
        n.EskiKlasorId);
}
