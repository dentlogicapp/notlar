using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

/// <summary>
/// v21 M7 (K6) + B2 - KVKK endpoint'leri.
/// Akis: login NORMAL akar -> /ben kvkkOnamGerekli=true -> frontend gecilemez onam
/// gate'i -> POST /api/kvkk/onam (kimlikli; IP + UA + zaman server'dan). Aktif metin
/// GET'i anonimdir (login ekranindaki metne-erisim linki - kanuni gereklilik).
/// Metin yayini atomiktir: eski aktifler duser + yeni aktif TEK SaveChanges.
/// SERH: metin icerigi hukuki gecerlilik icin AVUKAT ONAYINDAN gecmelidir.
/// </summary>
public static class KvkkEndpoints
{
    public static void MapKvkkEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/kvkk").WithTags("Kvkk");

        // AKTIF METIN - anonim (login ekrani + tam metin sayfasi buradan okur)
        g.MapGet("/aktif", async (AppDbContext db, CancellationToken ct) =>
        {
            var metin = await db.KvkkMetinleri
                .Where(x => x.Aktif)
                .OrderByDescending(x => x.Versiyon)
                .Select(x => new KvkkMetinYaniti(
                    x.Versiyon, x.Icerik, x.PazarlamaIcerik, x.Sha256Hash, x.YayinZamani))
                .FirstOrDefaultAsync(ct);
            return metin is null
                ? Results.NotFound(new { hata = "KVKK_METNI_YOK", mesaj = "Yayinlanmis KVKK metni bulunmuyor." })
                : Results.Ok(metin);
        });

        // ONAM - kimlikli (gate'ten gelir). Idempotent: ayni versiyona ikinci onam no-op.
        g.MapPost("/onam", async (
            KvkkOnamIstegi req, AppDbContext db, IUserContext uc,
            IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            var kid = uc.KullaniciId.Value;

            var aktif = await db.KvkkMetinleri
                .Where(x => x.Aktif).OrderByDescending(x => x.Versiyon)
                .FirstOrDefaultAsync(ct);
            if (aktif is null)
                return Results.BadRequest(new { hata = "KVKK_METNI_YOK", mesaj = "Yayinlanmis KVKK metni yok; onam alinamaz." });

            var mevcut = await db.KvkkOnamlari
                .AnyAsync(o => o.KullaniciId == kid && o.Versiyon == aktif.Versiyon, ct);
            if (mevcut) return Results.Ok(new { ok = true, zatenOnayli = true });

            db.KvkkOnamlari.Add(new KvkkOnami
            {
                KullaniciId = kid,
                Versiyon = aktif.Versiyon,
                MetinHash = aktif.Sha256Hash,
                PazarlamaIzni = req.PazarlamaIzni,
                Ip = uc.Ip,
                KullaniciAjan = uc.KullaniciAjan,
            });
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("kvkk_onam_verildi", "kvkk", null,
                degisenAlanlar: System.Text.Json.JsonSerializer.Serialize(new
                { versiyon = aktif.Versiyon, pazarlamaIzni = req.PazarlamaIzni }),
                detay: $"KVKK v{aktif.Versiyon} onami", ct: ct);

            return Results.Ok(new { ok = true, versiyon = aktif.Versiyon });
        }).RequireAuthorization();

        // ================= SUPER ADMIN =================
        var sa = app.MapGroup("/api/super-admin/kvkk").WithTags("SuperAdmin")
            .RequireAuthorization().RequireSuperAdmin();

        // METIN YAYINLA - yeni versiyon; ATOMIK: eski aktifler duser + yeni aktif TEK SaveChanges.
        sa.MapPost("/metin", async (
            KvkkMetinYayinIstegi req, AppDbContext db, IUserContext uc,
            IAuditService audit, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Icerik))
                return Results.BadRequest(new { hata = "ICERIK_ZORUNLU", mesaj = "KVKK metni zorunlu." });

            var icerik = req.Icerik.Trim();
            var pazarlama = string.IsNullOrWhiteSpace(req.PazarlamaIcerik) ? null : req.PazarlamaIcerik.Trim();
            var hash = Convert.ToHexString(SHA256.HashData(
                Encoding.UTF8.GetBytes(icerik + "\n---\n" + (pazarlama ?? "")))).ToLowerInvariant();

            var sonVersiyon = await db.KvkkMetinleri.MaxAsync(x => (int?)x.Versiyon, ct) ?? 0;
            var eskiAktifler = await db.KvkkMetinleri.Where(x => x.Aktif).ToListAsync(ct);
            foreach (var e in eskiAktifler) e.Aktif = false;

            var yeni = new KvkkMetni
            {
                Versiyon = sonVersiyon + 1,
                Icerik = icerik,
                PazarlamaIcerik = pazarlama,
                Sha256Hash = hash,
                Aktif = true,
                YayinlayanKullaniciId = uc.KullaniciId,
            };
            db.KvkkMetinleri.Add(yeni);
            await db.SaveChangesAsync(ct);  // dusurme + yayin atomik

            await audit.YazAsync("kvkk_metin_yayinlandi", "kvkk", yeni.Id,
                degisenAlanlar: System.Text.Json.JsonSerializer.Serialize(new
                { versiyon = yeni.Versiyon, hash }),
                detay: $"KVKK metni v{yeni.Versiyon} yayinlandi", ct: ct);

            return Results.Ok(new { ok = true, versiyon = yeni.Versiyon, hash });
        });

        // METIN LISTESI (versiyon gecmisi)
        sa.MapGet("/metinler", async (AppDbContext db, CancellationToken ct) =>
        {
            var liste = await db.KvkkMetinleri
                .OrderByDescending(x => x.Versiyon)
                .Select(x => new { x.Id, x.Versiyon, x.Sha256Hash, x.YayinZamani, x.Aktif })
                .ToListAsync(ct);
            return Results.Ok(liste);
        });

        // METIN DETAYI (tek versiyonun tam icerigi + yayinlayan ad) - Versiyon Gecmisi
        // butunsel goruntuleme + Kopyala/Yazdir/Taslaga Al + belge disa aktarim kaynagi.
        // Yayinlanmis Icerik degistirilmez; bu salt-okunur bir kanit goruntulemesidir.
        sa.MapGet("/metinler/{id:guid}", async (Guid id, AppDbContext db, CancellationToken ct) =>
        {
            var d = await db.KvkkMetinleri
                .Where(x => x.Id == id)
                .Select(x => new
                {
                    x.Id, x.Versiyon, x.Icerik, x.PazarlamaIcerik,
                    x.Sha256Hash, x.YayinZamani, x.Aktif, x.YayinlayanKullaniciId
                })
                .FirstOrDefaultAsync(ct);
            if (d is null)
                return Results.NotFound(new { hata = "KVKK_METNI_YOK", mesaj = "Belirtilen KVKK versiyonu bulunamadi." });

            string? yayinlayanAd = null;
            if (d.YayinlayanKullaniciId is Guid yid)
                yayinlayanAd = await db.Kullanicilar
                    .Where(k => k.Id == yid).Select(k => k.AdSoyad).FirstOrDefaultAsync(ct);

            return Results.Ok(new KvkkMetinDetayYaniti(
                d.Id, d.Versiyon, d.Icerik, d.PazarlamaIcerik,
                d.Sha256Hash, d.YayinZamani, d.Aktif, yayinlayanAd));
        });

        // BELGE - metin belgesi disa aktarim (PDF gorsel zirve / HTML tarayici).
        // KvkkBelgeTasarimcisi TEK KAYNAK HTML -> PdfRender Chromium (DefteriIndir deseni).
        sa.MapGet("/metinler/{id:guid}/belge", async (
            Guid id, string? format, AppDbContext db, IPdfRender pdfRender,
            CancellationToken ct) =>
        {
            var d = await db.KvkkMetinleri
                .Where(x => x.Id == id)
                .Select(x => new
                {
                    x.Versiyon, x.Icerik, x.PazarlamaIcerik,
                    x.Sha256Hash, x.YayinZamani, x.Aktif, x.YayinlayanKullaniciId
                })
                .FirstOrDefaultAsync(ct);
            if (d is null)
                return Results.NotFound(new { hata = "KVKK_METNI_YOK", mesaj = "Versiyon bulunamadi." });

            string? yayinlayanAd = null;
            if (d.YayinlayanKullaniciId is Guid yid)
                yayinlayanAd = await db.Kullanicilar
                    .Where(k => k.Id == yid).Select(k => k.AdSoyad).FirstOrDefaultAsync(ct);

            var markaAdi = await db.Isletmeler.OrderBy(i => i.OlusturmaZamani)
                .Select(i => i.MarkaAdi).FirstOrDefaultAsync(ct) ?? "Planlama Defteri";

            var html = KvkkBelgeTasarimcisi.MetinBelgesi(
                markaAdi, d.Versiyon, d.Icerik, d.PazarlamaIcerik,
                d.Sha256Hash, d.YayinZamani, yayinlayanAd, d.Aktif);

            var dosyaAd = $"kvkk-metni-v{d.Versiyon}";
            return (format?.ToLowerInvariant()) switch
            {
                "html" => Results.File(Encoding.UTF8.GetBytes(html),
                    "text/html; charset=utf-8", $"{dosyaAd}.html"),
                _ => Results.File(await pdfRender.HtmlPdfeAsync(html, ct),
                    "application/pdf", $"{dosyaAd}.pdf"),
            };
        });

        // ONAM SICILI - onam kayitlari disa aktarim (PDF sicil / XLSX tablo).
        // PDF: KvkkBelgeTasarimcisi.OnamKayitDefteri; XLSX: KvkkOnamXlsxTasarimcisi (XlsxPaleti).
        sa.MapGet("/onamlar/belge", async (
            string? format, AppDbContext db, IPdfRender pdfRender,
            CancellationToken ct) =>
        {
            var kayitlar = await db.KvkkOnamlari
                .Join(db.Kullanicilar, o => o.KullaniciId, k => k.Id, (o, k) => new { o, k })
                .OrderByDescending(x => x.o.OnamZamani)
                .Take(500)
                .Select(x => new
                {
                    x.k.AdSoyad, x.k.Email, x.o.Versiyon,
                    x.o.PazarlamaIzni, x.o.Ip, x.o.KullaniciAjan, x.o.OnamZamani
                })
                .ToListAsync(ct);

            var markaAdi = await db.Isletmeler.OrderBy(i => i.OlusturmaZamani)
                .Select(i => i.MarkaAdi).FirstOrDefaultAsync(ct) ?? "Planlama Defteri";

            if ((format?.ToLowerInvariant()) == "xlsx")
            {
                var satirlar = kayitlar.Select(x => new KvkkOnamSicilSatiri(
                    x.AdSoyad, x.Email, x.Versiyon, x.PazarlamaIzni,
                    x.Ip, x.KullaniciAjan, x.OnamZamani)).ToList();
                var xlsx = KvkkOnamXlsxTasarimcisi.Uret(markaAdi, satirlar);
                return Results.File(xlsx,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "kvkk-onam-kayitlari.xlsx");
            }

            var pdfSatirlar = kayitlar.Select(x => new OnamSatirVeri(
                x.AdSoyad, x.Email, x.Versiyon, x.PazarlamaIzni,
                x.Ip, x.OnamZamani)).ToList();
            var html = KvkkBelgeTasarimcisi.OnamKayitDefteri(markaAdi, pdfSatirlar);
            return Results.File(await pdfRender.HtmlPdfeAsync(html, ct),
                "application/pdf", "kvkk-onam-kayitlari.pdf");
        });

        // B2 - ONAM KAYITLARI (salt-okunur; kim / ne zaman / versiyon / hash / pazarlama / IP)
        sa.MapGet("/onamlar", async (AppDbContext db, CancellationToken ct) =>
        {
            // G.2 - EF Core, parametreli constructor (positional record) projeksiyonundan
            // SONRA o tipin uyesi uzerinden OrderBy'i SQL'e ceviremez (bilinen sinirlilik -> 500).
            // Dogru sira: anonim tip join -> siralama -> Take -> record projeksiyonu EN SONDA.
            var liste = await db.KvkkOnamlari
                .Join(db.Kullanicilar, o => o.KullaniciId, k => k.Id, (o, k) => new { o, k })
                .OrderByDescending(x => x.o.OnamZamani)
                .Take(500)
                .Select(x => new KvkkOnamKaydiYaniti(
                    x.o.Id, x.k.AdSoyad, x.k.Email, x.o.Versiyon, x.o.MetinHash,
                    x.o.PazarlamaIzni, x.o.Ip, x.o.KullaniciAjan, x.o.OnamZamani))
                .ToListAsync(ct);
            return Results.Ok(liste);
        });
    }
}

// DTO'lar (dosya-lokal; DuyuruEndpoints deseni)
public sealed record KvkkOnamIstegi(bool PazarlamaIzni);
public sealed record KvkkMetinYayinIstegi(string Icerik, string? PazarlamaIcerik);
public sealed record KvkkMetinYaniti(
    int Versiyon, string Icerik, string? PazarlamaIcerik, string Sha256Hash, DateTimeOffset YayinZamani);
public sealed record KvkkOnamKaydiYaniti(
    Guid Id, string AdSoyad, string Email, int Versiyon, string MetinHash,
    bool PazarlamaIzni, string? Ip, string? KullaniciAjan, DateTimeOffset OnamZamani);
public sealed record KvkkMetinDetayYaniti(
    Guid Id, int Versiyon, string Icerik, string? PazarlamaIcerik,
    string Sha256Hash, DateTimeOffset YayinZamani, bool Aktif, string? YayinlayanAdSoyad);
