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

        // Tüm klasörleri listele (sadece silinmemiş)
        g.MapGet("/", async (AppDbContext db, CancellationToken ct) =>
        {
            var list = await db.Klasorler
                .Where(k => !k.Silindi)
                .Include(k => k.OlusturanKullanici)
                .OrderBy(k => k.UstKlasorId).ThenBy(k => k.Ad)
                .Select(k => new KlasorYaniti(
                    k.Id, k.Ad, k.Aciklama, k.Ikon, k.UstKlasorId,
                    k.OlusturanKullanici.AdSoyad, k.OlusturmaZamani,
                    db.Notlar.Count(n => n.KlasorId == k.Id && !n.Silindi),
                    db.Klasorler.Count(c => c.UstKlasorId == k.Id && !c.Silindi)))
                .ToListAsync(ct);
            return Results.Ok(list);
        });

        // Oluştur
        g.MapPost("/", async (
            KlasorOlusturIstegi req, AppDbContext db,
            IUserContext uc, IAuditService audit, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Ad))
                return Results.BadRequest(new { hata = "Ad zorunlu." });
            if (uc.KullaniciId is null) return Results.Unauthorized();

            // 2 seviye kuralı: alt klasörün ust klasoru null olamaz (zaten 2. seviye)
            if (req.UstKlasorId.HasValue)
            {
                var ust = await db.Klasorler.FindAsync([req.UstKlasorId.Value], ct);
                if (ust is null) return Results.BadRequest(new { hata = "Üst klasör bulunamadı." });
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
                    olusturanAd, k.OlusturmaZamani, 0, 0));
        });

        // Güncelle
        g.MapPut("/{id:guid}", async (
            Guid id, KlasorGuncelleIstegi req, AppDbContext db,
            IAuditService audit, CancellationToken ct) =>
        {
            var k = await db.Klasorler.Include(x => x.OlusturanKullanici)
                .FirstOrDefaultAsync(x => x.Id == id && !x.Silindi, ct);
            if (k is null) return Results.NotFound();

            if (string.IsNullOrWhiteSpace(req.Ad))
                return Results.BadRequest(new { hata = "Ad zorunlu." });

            var eski = $"{{\"ad\":\"{k.Ad}\",\"ikon\":\"{k.Ikon}\"}}";
            k.Ad = req.Ad.Trim();
            k.Aciklama = req.Aciklama?.Trim();
            if (!string.IsNullOrWhiteSpace(req.Ikon)) k.Ikon = req.Ikon.Trim();
            var yeni = $"{{\"ad\":\"{k.Ad}\",\"ikon\":\"{k.Ikon}\"}}";
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("klasor_guncellendi", "klasor", k.Id,
                degisenAlanlar: $"{{\"eski\":{eski},\"yeni\":{yeni}}}", ct: ct);

            return Results.Ok(new KlasorYaniti(k.Id, k.Ad, k.Aciklama, k.Ikon, k.UstKlasorId,
                k.OlusturanKullanici.AdSoyad, k.OlusturmaZamani,
                await db.Notlar.CountAsync(n => n.KlasorId == k.Id && !n.Silindi, ct),
                await db.Klasorler.CountAsync(c => c.UstKlasorId == k.Id && !c.Silindi, ct)));
        });

        // İçerik özeti — silme onayı öncesi frontend buradan klasörde kaç not olduğunu öğrenir
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

        // Soft delete — içerikteki notları "kategorize edilmemiş"e taşıyıp klasörü siler
        // (Frontend önce /icerik-ozeti ile kullanıcıya bilgi gösterir, onayla bu endpoint çağrılır)
        g.MapDelete("/{id:guid}", async (
            Guid id, AppDbContext db, IAuditService audit, CancellationToken ct) =>
        {
            var k = await db.Klasorler.FirstOrDefaultAsync(x => x.Id == id && !x.Silindi, ct);
            if (k is null) return Results.NotFound();

            // Alt klasör kontrolü — 2 seviyeden fazla iç içe klasör mimariye aykırı,
            // alt klasörler de varsa onları da kategori dışına almak yerine işlemi reddet.
            var altVar = await db.Klasorler.AnyAsync(c => c.UstKlasorId == id && !c.Silindi, ct);
            if (altVar)
                return Results.BadRequest(new {
                    hata = "Bu klasörün alt klasörleri var. Önce onları sil veya başka klasöre taşı."
                });

            // İçerikteki tüm notları (bekleyen + tamamlanan + silinmiş) kategorize edilmemişe taşı
            var tasinacakNotlar = await db.Notlar
                .Where(n => n.KlasorId == id)
                .ToListAsync(ct);
            var tasinanSayi = tasinacakNotlar.Count;
            foreach (var n in tasinacakNotlar)
            {
                n.KlasorId = null;
                n.GuncellemeZamani = DateTimeOffset.UtcNow;
            }

            // Klasörü soft delete et
            k.Silindi = true;
            k.SilinmeZamani = DateTimeOffset.UtcNow;

            await db.SaveChangesAsync(ct);

            // Audit — silme + içerik taşıma birlikte tek kayıt
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
