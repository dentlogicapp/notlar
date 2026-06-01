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

        // LIST — tüm klasörler + kilit sahibi adları batch
        g.MapGet("/", async (AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            var klasorler = await db.Klasorler
                .Where(k => !k.Silindi)
                .Include(k => k.OlusturanKullanici)
                // Tamamlananlar sistem klasörü her zaman en sonda
                .OrderBy(k => k.SistemMi).ThenBy(k => k.UstKlasorId).ThenBy(k => k.Ad)
                .ToListAsync(ct);

            // Kilit sahibi adlarını batch
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

            // Not + alt klasör sayıları için 2 sorgu daha (klasör adetince N+1 olmaması için)
            var notSayilari = await db.Notlar
                .Where(n => n.KlasorId != null && !n.Silindi)
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

        // CREATE
        g.MapPost("/", async (
            KlasorOlusturIstegi req, AppDbContext db,
            IUserContext uc, IAuditService audit, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Ad))
                return Results.BadRequest(new { hata = "Ad zorunlu." });
            if (uc.KullaniciId is null) return Results.Unauthorized();

            // "Tamamlananlar" gibi sistem isimleri rezerve
            if (req.Ad.Trim().Equals("Tamamlananlar", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { hata = "Bu klasör adı sistem tarafından kullanılıyor." });

            if (req.UstKlasorId.HasValue)
            {
                var ust = await db.Klasorler.FindAsync([req.UstKlasorId.Value], ct);
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
                OlusturanKullaniciId = uc.KullaniciId.Value
            };
            db.Klasorler.Add(k);
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("klasor_olusturuldu", "klasor", k.Id, detay: k.Ad, ct: ct);

            var olusturanAd = uc.AdSoyad ?? "";
            return Results.Created($"/api/klasorler/{k.Id}",
                new KlasorYaniti(k.Id, k.Ad, k.Aciklama, k.Ikon, k.UstKlasorId,
                    olusturanAd, k.OlusturmaZamani, 0, 0, false, null));
        });

        // UPDATE
        g.MapPut("/{id:guid}", async (
            Guid id, KlasorGuncelleIstegi req, AppDbContext db,
            IUserContext uc, IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            var k = await db.Klasorler.Include(x => x.OlusturanKullanici)
                .FirstOrDefaultAsync(x => x.Id == id && !x.Silindi, ct);
            if (k is null) return Results.NotFound();
            if (k.SistemMi) return Results.BadRequest(new { hata = "Sistem klasörü düzenlenemez." });

            // Kilit kontrolü
            var kilitSahibi = await LockEndpoints.KilitBaskasiMi(
                db, k.KilitKullaniciId, k.KilitZamani, uc.KullaniciId.Value, ct);
            if (kilitSahibi is not null)
                return Results.Json(new { hata = $"{kilitSahibi} şu anda bu klasörü düzenliyor." }, statusCode: 409);

            if (string.IsNullOrWhiteSpace(req.Ad))
                return Results.BadRequest(new { hata = "Ad zorunlu." });

            // Rezerve isim
            if (req.Ad.Trim().Equals("Tamamlananlar", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { hata = "Bu ad sistem klasörü tarafından kullanılıyor." });

            var eski = $"{{\"ad\":\"{k.Ad}\",\"ikon\":\"{k.Ikon}\"}}";
            k.Ad = req.Ad.Trim();
            k.Aciklama = req.Aciklama?.Trim();
            if (!string.IsNullOrWhiteSpace(req.Ikon)) k.Ikon = req.Ikon.Trim();
            var yeni = $"{{\"ad\":\"{k.Ad}\",\"ikon\":\"{k.Ikon}\"}}";

            // Kilit bırak
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
                await db.Notlar.CountAsync(n => n.KlasorId == k.Id && !n.Silindi, ct),
                await db.Klasorler.CountAsync(c => c.UstKlasorId == k.Id && !c.Silindi, ct),
                false, null));
        });

        // İçerik özeti
        g.MapGet("/{id:guid}/icerik-ozeti", async (
            Guid id, AppDbContext db, CancellationToken ct) =>
        {
            var k = await db.Klasorler.FirstOrDefaultAsync(x => x.Id == id && !x.Silindi, ct);
            if (k is null) return Results.NotFound();

            var bekleyen = await db.Notlar.CountAsync(n => n.KlasorId == id && !n.Silindi && !n.Tamamlandi, ct);
            var tamamlanan = await db.Notlar.CountAsync(n => n.KlasorId == id && !n.Silindi && n.Tamamlandi, ct);
            var silinmis = await db.Notlar.CountAsync(n => n.KlasorId == id && n.Silindi, ct);

            return Results.Ok(new KlasorIcerikOzetYaniti(
                k.Id, k.Ad, bekleyen, tamamlanan, silinmis, bekleyen + tamamlanan + silinmis));
        });

        // DELETE
        g.MapDelete("/{id:guid}", async (
            Guid id, AppDbContext db, IUserContext uc, IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            var k = await db.Klasorler.FirstOrDefaultAsync(x => x.Id == id && !x.Silindi, ct);
            if (k is null) return Results.NotFound();
            if (k.SistemMi) return Results.BadRequest(new { hata = "Sistem klasörü silinemez." });

            // Kilit kontrolü
            var kilitSahibi = await LockEndpoints.KilitBaskasiMi(
                db, k.KilitKullaniciId, k.KilitZamani, uc.KullaniciId.Value, ct);
            if (kilitSahibi is not null)
                return Results.Json(new { hata = $"{kilitSahibi} şu anda bu klasörü düzenliyor." }, statusCode: 409);

            var altVar = await db.Klasorler.AnyAsync(c => c.UstKlasorId == id && !c.Silindi, ct);
            if (altVar)
                return Results.BadRequest(new {
                    hata = "Bu klasörün alt klasörleri var. Önce onları sil veya başka klasöre taşı."
                });

            var tasinacakNotlar = await db.Notlar
                .Where(n => n.KlasorId == id)
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
