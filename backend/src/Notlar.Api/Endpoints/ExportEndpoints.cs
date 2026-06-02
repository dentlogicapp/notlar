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
            CancellationToken ct) =>
        {
            // Veriyi topla — klasörler (sistem dahil, sırayla) + notları
            var klasorler = await db.Klasorler
                .Where(k => !k.Silindi)
                .Include(k => k.OlusturanKullanici)
                .OrderBy(k => k.SistemMi).ThenBy(k => k.Ad)
                .ToListAsync(ct);

            var notlar = await db.Notlar
                .Where(n => !n.Silindi)
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
            var html = HtmlTasarimcisi.Uret(gruplar);  // TEK KAYNAK

            return format?.ToLowerInvariant() switch
            {
                "html" => HtmlVer(html, tarih),
                "pdf"  => await PdfVer(html, tarih, pdfRender, ct),
                "docx" => await DocxVer(html, tarih, docxDonusturucu, ct),
                "xlsx" => XlsxVer(gruplar, tarih),
                _ => Results.BadRequest(new { hata = "format parametresi: html | pdf | docx | xlsx" })
            };
        });
    }

    // ──────── FORMAT HELPER'LARI ────────

    private static IResult HtmlVer(string html, string tarih) =>
        Results.File(Encoding.UTF8.GetBytes(html), "text/html; charset=utf-8",
            $"planlama-defterimiz-{tarih}.html");

    private static async Task<IResult> PdfVer(string html, string tarih,
        IPdfRender pdfRender, CancellationToken ct)
    {
        var pdf = await pdfRender.HtmlPdfeAsync(html, ct);
        return Results.File(pdf, "application/pdf",
            $"planlama-defterimiz-{tarih}.pdf");
    }

    private static async Task<IResult> DocxVer(string html, string tarih,
        IDocxDonusturucu donusturucu, CancellationToken ct)
    {
        var docx = await donusturucu.HtmlDocxeAsync(html, ct);
        return Results.File(docx,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            $"planlama-defterimiz-{tarih}.docx");
    }

    private static IResult XlsxVer(
        List<(string Ad, bool SistemMi, List<Not> Notlar)> gruplar, string tarih)
    {
        var xlsx = XlsxTasarimcisi.Uret(gruplar);
        return Results.File(xlsx,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"planlama-defterimiz-{tarih}.xlsx");
    }
}
