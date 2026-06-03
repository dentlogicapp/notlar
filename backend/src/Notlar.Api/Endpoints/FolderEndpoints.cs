using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using Notlar.Api.Models;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

public static class FolderEndpoints
{
    public static void MapFolderEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/klasorler").WithTags("Klasorler").RequireAuthorization();

        // LIST — tenant-scoped klasörler + kilit sahibi adları
        g.MapGet("/", async (AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            // v15 — Tenant kontrolü
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tenantId = uc.AktifIsletmeId.Value;

            var klasorler = await db.Klasorler
                .Where(k => !k.Silindi && k.IsletmeId == tenantId)
                .Include(k => k.OlusturanKullanici)
                .OrderBy(k => k.SistemMi).ThenBy(k => k.UstKlasorId).ThenBy(k => k.Ad)
                .ToListAsync(ct);

            var kilitSuresi = TimeSpan.FromSeconds(45);
            var simdi = DateTimeOffset.UtcNow;
            var aktifKilitIds = klasorler
                .Where(k => k.KilitKullaniciId.HasValue
                         && k.KilitKullaniciId != uc.KullaniciId
                         && k.KilitZamani.HasValue
                         && (simdi - k.KilitZamani.Value) <= kilitSuresi)
                .Select(k => k.KilitKullaniciId!.Value)
                .Distinct()
                .ToList();

            var kilitSahipleri = aktifKilitIds.Count > 0
                ? await db.Kullanicilar
                    .Where(u => aktifKilitIds.Contains(u.Id))
                    .ToDictionaryAsync(u => u.Id, u => u.AdSoyad, ct)
                : new Dictionary<Guid, string>();

            // v15 — Not + alt klasör sayıları tenant-scoped
            var notSayilari = await db.Notlar
                .Where(n => n.KlasorId != null && !n.Silindi && n.IsletmeId == tenantId)
                .GroupBy(n => n.KlasorId!.Value)
                .Select(grp => new { KlasorId = grp.Key, Sayi = grp.Count() })
                .ToDictionaryAsync(x => x.KlasorId, x => x.Sayi, ct);

            var altKlasorSayilari = klasorler
                .Where(k => k.UstKlasorId.HasValue)
                .GroupBy(k => k.UstKlasorId!.Value)
                .ToDictionary(g => g.Key, g => g.Count());

            var list = klasorler.Select(k =>
            {
                string? sahibi = null;
                if (k.KilitKullaniciId.HasValue
                    && k.KilitKullaniciId != uc.KullaniciId
                    && k.KilitZamani.HasValue
                    && (simdi - k.KilitZamani.Value) <= kilitSuresi)
                {
                    kilitSahipleri.TryGetValue(k.KilitKullaniciId.Value, out sahibi);
                }
                return new KlasorYaniti(
                    k.Id, k.Ad, k.Aciklama, k.Ikon, k.UstKlasorId,
                    k.OlusturanKullanici.AdSoyad, k.OlusturmaZamani,
                    notSayilari.GetValueOrDefault(k.Id, 0),
                    altKlasorSayilari.GetValueOrDefault(k.Id, 0),
                    k.SistemMi,
                    sahibi);
            }).ToList();

            return Results.Ok(list);
        });

        // CREATE — tenant-scoped
        g.MapPost("/", async (
            KlasorOlusturIstegi req, AppDbContext db,
            IUserContext uc, IAuditService audit, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Ad))
                return Results.BadRequest(new { hata = "Ad zorunlu." });
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            // v15 — Görüntüleme modunda yazma engelle
            if (uc.GoruntumeModu) return Results.StatusCode(403);

            var tenantId = uc.AktifIsletmeId.Value;

            if (req.Ad.Trim().Equals("Tamamlananlar", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { hata = "Bu klasör adı sistem tarafından kullanılıyor." });

            if (req.UstKlasorId.HasValue)
            {
                // v15 — Üst klasör de aynı tenant'ta olmalı
                var ust = await db.Klasorler
                    .FirstOrDefaultAsync(x => x.Id == req.UstKlasorId.Value && x.IsletmeId == tenantId, ct);
                if (ust is null) return Results.BadRequest(new { hata = "Üst klasör bulunamadı." });
                if (ust.SistemMi) return Results.BadRequest(new { hata = "Sistem klasörü altına yeni klasör eklenemez." });
                if (ust.UstKlasorId.HasValue)
                    return Results.BadRequest(new { hata = "2 seviyeden fazla iç içe klasör desteklenmez." });
            }

            var k = new Klasor
            {
                Ad = req.Ad.Trim(),
                Aciklama = req.Aciklama?.Trim(),
                Ikon = string.IsNullOrWhiteSpace(req.Ikon) ? "klasor" : req.Ikon.Trim(),
                UstKlasorId = req.UstKlasorId,
                OlusturanKullaniciId = uc.KullaniciId.Value,
                IsletmeId = tenantId,  // v15
            };
            db.Klasorler.Add(k);
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("klasor_olusturuldu", "klasor", k.Id, detay: k.Ad, ct: ct);

            var olusturanAd = uc.AdSoyad ?? "";
            return Results.Created($"/api/klasorler/{k.Id}",
                new KlasorYaniti(k.Id, k.Ad, k.Aciklama, k.Ikon, k.UstKlasorId,
                    olusturanAd, k.OlusturmaZamani, 0, 0, false, null));
        });

        // UPDATE — tenant-scoped
        g.MapPut("/{id:guid}", async (
            Guid id, KlasorGuncelleIstegi req, AppDbContext db,
            IUserContext uc, IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);

            var tenantId = uc.AktifIsletmeId.Value;
            var k = await db.Klasorler.Include(x => x.OlusturanKullanici)
                .FirstOrDefaultAsync(x => x.Id == id && !x.Silindi && x.IsletmeId == tenantId, ct);
            if (k is null) return Results.NotFound();
            if (k.SistemMi) return Results.BadRequest(new { hata = "Sistem klasörü düzenlenemez." });

            var kilitSahibi = await LockEndpoints.KilitBaskasiMi(
                db, k.KilitKullaniciId, k.KilitZamani, uc.KullaniciId.Value, ct);
            if (kilitSahibi is not null)
                return Results.Json(new { hata = $"{kilitSahibi} şu anda bu klasörü düzenliyor." }, statusCode: 409);

            if (string.IsNullOrWhiteSpace(req.Ad))
                return Results.BadRequest(new { hata = "Ad zorunlu." });

            if (req.Ad.Trim().Equals("Tamamlananlar", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { hata = "Bu ad sistem klasörü tarafından kullanılıyor." });

            var eski = $"{{\"ad\":\"{k.Ad}\",\"ikon\":\"{k.Ikon}\"}}";
            k.Ad = req.Ad.Trim();
            k.Aciklama = req.Aciklama?.Trim();
            if (!string.IsNullOrWhiteSpace(req.Ikon)) k.Ikon = req.Ikon.Trim();
            var yeni = $"{{\"ad\":\"{k.Ad}\",\"ikon\":\"{k.Ikon}\"}}";

            if (k.KilitKullaniciId == uc.KullaniciId.Value)
            {
                k.KilitKullaniciId = null;
                k.KilitZamani = null;
            }

            await db.SaveChangesAsync(ct);

            await audit.YazAsync("klasor_guncellendi", "klasor", k.Id,
                degisenAlanlar: $"{{\"eski\":{eski},\"yeni\":{yeni}}}", ct: ct);

            return Results.Ok(new KlasorYaniti(k.Id, k.Ad, k.Aciklama, k.Ikon, k.UstKlasorId,
                k.OlusturanKullanici.AdSoyad, k.OlusturmaZamani,
                await db.Notlar.CountAsync(n => n.KlasorId == k.Id && !n.Silindi && n.IsletmeId == tenantId, ct),
                await db.Klasorler.CountAsync(c => c.UstKlasorId == k.Id && !c.Silindi && c.IsletmeId == tenantId, ct),
                false, null));
        });

        // İçerik özeti — tenant-scoped
        g.MapGet("/{id:guid}/icerik-ozeti", async (
            Guid id, AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tenantId = uc.AktifIsletmeId.Value;

            var k = await db.Klasorler.FirstOrDefaultAsync(
                x => x.Id == id && !x.Silindi && x.IsletmeId == tenantId, ct);
            if (k is null) return Results.NotFound();

            var bekleyen = await db.Notlar.CountAsync(n => n.KlasorId == id && !n.Silindi && !n.Tamamlandi && n.IsletmeId == tenantId, ct);
            var tamamlanan = await db.Notlar.CountAsync(n => n.KlasorId == id && !n.Silindi && n.Tamamlandi && n.IsletmeId == tenantId, ct);
            var silinmis = await db.Notlar.CountAsync(n => n.KlasorId == id && n.Silindi && n.IsletmeId == tenantId, ct);

            return Results.Ok(new KlasorIcerikOzetYaniti(
                k.Id, k.Ad, bekleyen, tamamlanan, silinmis, bekleyen + tamamlanan + silinmis));
        });

        // DELETE — tenant-scoped
        g.MapDelete("/{id:guid}", async (
            Guid id, AppDbContext db, IUserContext uc, IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);

            var tenantId = uc.AktifIsletmeId.Value;
            var k = await db.Klasorler.FirstOrDefaultAsync(
                x => x.Id == id && !x.Silindi && x.IsletmeId == tenantId, ct);
            if (k is null) return Results.NotFound();
            if (k.SistemMi) return Results.BadRequest(new { hata = "Sistem klasörü silinemez." });

            var kilitSahibi = await LockEndpoints.KilitBaskasiMi(
                db, k.KilitKullaniciId, k.KilitZamani, uc.KullaniciId.Value, ct);
            if (kilitSahibi is not null)
                return Results.Json(new { hata = $"{kilitSahibi} şu anda bu klasörü düzenliyor." }, statusCode: 409);

            var altVar = await db.Klasorler.AnyAsync(c => c.UstKlasorId == id && !c.Silindi && c.IsletmeId == tenantId, ct);
            if (altVar)
                return Results.BadRequest(new {
                    hata = "Bu klasörün alt klasörleri var. Önce onları sil veya başka klasöre taşı."
                });

            var tasinacakNotlar = await db.Notlar
                .Where(n => n.KlasorId == id && n.IsletmeId == tenantId)
                .ToListAsync(ct);
            var tasinanSayi = tasinacakNotlar.Count;
            foreach (var n in tasinacakNotlar)
            {
                n.KlasorId = null;
                n.GuncellemeZamani = DateTimeOffset.UtcNow;
            }

            k.Silindi = true;
            k.SilinmeZamani = DateTimeOffset.UtcNow;

            await db.SaveChangesAsync(ct);

            await audit.YazAsync(
                "klasor_silindi", "klasor", k.Id,
                detay: tasinanSayi > 0
                    ? $"{k.Ad} (içindeki {tasinanSayi} not kategorize edilmemişe taşındı)"
                    : k.Ad,
                degisenAlanlar: $"{{\"klasorAd\":\"{k.Ad}\",\"tasinanNotSayisi\":{tasinanSayi}}}",
                ct: ct);

            return Results.NoContent();
        });
    }
}
