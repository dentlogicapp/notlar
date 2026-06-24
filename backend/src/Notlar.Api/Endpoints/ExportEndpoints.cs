using System.Text;
using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

/// <summary>
/// v14 — Defteri İndir endpoint'i.
/// Tüm formatlar TEK kaynaktan üretilir (HtmlTasarimcisi → davetiye kalitesinde HTML).
/// PDF: Chromium headless print (Playwright).
/// DOCX: HtmlToOpenXml (brand korunur, Word'de düzenlenebilir).
/// XLSX: Modernize edilmiş XlsxTasarimcisi (Genel Bakış sheet + hyperlink köprü + read-only protection).
/// </summary>
public static class ExportEndpoints
{
    public static void MapExportEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/defteri-indir").WithTags("Defteri İndir").RequireAuthorization();

        g.MapGet("/", async (
            string format,
            AppDbContext db,
            IPdfRender pdfRender,
            IDocxDonusturucu docxDonusturucu,
            IUserContext uc,
            CancellationToken ct) =>
        {
            // v15 — Tenant kontrolü
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tenantId = uc.AktifIsletmeId.Value;

            // v19 — Marka adi entity'den (senkron cache); SAYAC bilgisi isletme_metinleri'nden (tek kaynak).
            var isletme = await db.Isletmeler
                .Where(i => i.Id == tenantId)
                .Select(i => new { i.MarkaAdi })
                .FirstOrDefaultAsync(ct);

            // Sayac: sayac_aktif / sayac_hedef_tarihi / sayac_aktif_cumle / sayac_bitti_cumle (CountdownWidget mantigi)
            var sayacMetinleri = await db.IsletmeMetinleri
                .Where(m => m.IsletmeId == tenantId &&
                    (m.Anahtar == "sayac_aktif" || m.Anahtar == "sayac_hedef_tarihi" ||
                     m.Anahtar == "sayac_aktif_cumle" || m.Anahtar == "sayac_bitti_cumle"))
                .ToDictionaryAsync(m => m.Anahtar, m => m.Icerik, ct);
            var sayacBilgi = SayacBilgiHesapla(sayacMetinleri);

            // v14/v15 — Dinamik: bu tenant'taki aktif üyelerin adlarından çift ismi
            var adlar = await db.IsletmeUyelikleri
                .Include(u => u.Kullanici)
                .Where(u => u.IsletmeId == tenantId && u.Aktif && u.Kullanici.Aktif)
                .OrderBy(u => u.KatilmaZamani)
                .Select(u => u.Kullanici.AdSoyad)
                .ToListAsync(ct);
            var ciftIsmi = adlar.Count > 0
                ? string.Join(" & ", adlar)
                : (isletme?.MarkaAdi ?? "Planlama Defteri");

            // Veriyi topla — tenant-scoped
            var klasorler = await db.Klasorler
                .Where(k => !k.Silindi && k.IsletmeId == tenantId)
                .Include(k => k.OlusturanKullanici)
                .OrderBy(k => k.SistemMi).ThenBy(k => k.Ad)
                .ToListAsync(ct);

            var notlar = await db.Notlar
                .Where(n => !n.Silindi && n.IsletmeId == tenantId)
                .Include(n => n.OlusturanKullanici)
                .Include(n => n.TamamlayanKullanici)
                .OrderBy(n => n.KlasorId).ThenBy(n => n.OlusturmaZamani)
                .ToListAsync(ct);

            // Klasörsüz + her klasör için bir grup
            var gruplar = new List<(string Ad, bool SistemMi, List<Not> Notlar)>();

            var klasorsuz = notlar.Where(n => n.KlasorId is null).ToList();
            if (klasorsuz.Count > 0)
                gruplar.Add(("Klasörsüz Notlar", false, klasorsuz));

            foreach (var k in klasorler)
            {
                var grpNotlar = notlar.Where(n => n.KlasorId == k.Id).ToList();
                gruplar.Add((k.Ad, k.SistemMi, grpNotlar));
            }

            var tarih = DateTimeOffset.Now.ToString("yyyy-MM-dd_HH-mm");
            var markaAdi = isletme?.MarkaAdi ?? "Defter";
            var html = HtmlTasarimcisi.Uret(gruplar, markaAdi, ciftIsmi, sayacBilgi);  // TEK KAYNAK

            return format?.ToLowerInvariant() switch
            {
                "html" => HtmlVer(html, tarih),
                "pdf"  => await PdfVer(html, tarih, pdfRender, ct),
                "docx" => await DocxVer(gruplar, markaAdi, ciftIsmi, sayacBilgi, tarih, docxDonusturucu, ct),
                "xlsx" => XlsxVer(gruplar, markaAdi, tarih, sayacBilgi),
                _ => Results.BadRequest(new { hata = "format parametresi: html | pdf | docx | xlsx" })
            };
        });
    }

    // ──────── FORMAT HELPER'LARI ────────

    private static IResult HtmlVer(string html, string tarih) =>
        Results.File(Encoding.UTF8.GetBytes(html), "text/html; charset=utf-8",
            $"defter-{tarih}.html");

    private static async Task<IResult> PdfVer(string html, string tarih,
        IPdfRender pdfRender, CancellationToken ct)
    {
        var pdf = await pdfRender.HtmlPdfeAsync(html, ct);
        return Results.File(pdf, "application/pdf",
            $"defter-{tarih}.pdf");
    }

    private static async Task<IResult> DocxVer(
        List<(string Ad, bool SistemMi, List<Not> Notlar)> gruplar,
        string markaAdi, string ciftIsmi, SayacBilgi sayac, string tarih,
        IDocxDonusturucu donusturucu, CancellationToken ct)
    {
        var docx = await donusturucu.UretAsync(gruplar, markaAdi, ciftIsmi, sayac, ct);
        return Results.File(docx,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            $"defter-{tarih}.docx");
    }

    private static IResult XlsxVer(
        List<(string Ad, bool SistemMi, List<Not> Notlar)> gruplar, string markaAdi, string tarih, SayacBilgi sayac)
    {
        var xlsx = XlsxTasarimcisi.Uret(gruplar, markaAdi, sayac);
        return Results.File(xlsx,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"defter-{tarih}.xlsx");
    }

    // v19 - Sayac bilgisini isletme_metinleri'nden hesaplar (CountdownWidget ile ayni mantik).
    // Aktif degilse / tarih yoksa Aktif=false -> defterde sayac satiri gizlenir.
    private static SayacBilgi SayacBilgiHesapla(Dictionary<string, string> m)
    {
        var aktif = m.GetValueOrDefault("sayac_aktif") == "true";
        if (!aktif) return new SayacBilgi(false, 0, false, "");
        if (!DateTime.TryParse(m.GetValueOrDefault("sayac_hedef_tarihi"), out var hedef))
            return new SayacBilgi(false, 0, false, "");

        var bugun = DateTime.UtcNow.Date;
        var gecti = hedef.Date < bugun;
        var gun = Math.Abs((hedef.Date - bugun).Days);
        var cumle = gecti
            ? (m.GetValueOrDefault("sayac_bitti_cumle") ?? "")
            : (m.GetValueOrDefault("sayac_aktif_cumle") ?? "");
        return new SayacBilgi(true, gun, gecti, cumle);
    }
}
