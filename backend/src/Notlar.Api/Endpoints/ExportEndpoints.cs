using System.Net;
using System.Text;
using ClosedXML.Excel;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Notlar.Api.Endpoints;

/// <summary>
/// Defteri Dışa Aktar — HTML / PDF / DOCX / XLSX
/// Markdown ve JSON DEĞİL — ticari ham veri dışarı vermiyoruz. Görsel okuma odaklı.
/// Marka paleti: terracotta #c4704d, clay #3d2817 / #5d4a37, cream #faf6ef
/// </summary>
public static class ExportEndpoints
{
    public static void MapExportEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/defteri-indir").WithTags("Defteri İndir").RequireAuthorization();

        g.MapGet("/", async (
            string format,
            AppDbContext db,
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

            // Klasör adı haritası
            var klasorAd = klasorler.ToDictionary(k => k.Id, k => k.Ad);

            // Klasörsüz + her klasör için bir grup
            var gruplar = new List<(string AdGrup, bool SistemMi, List<Not> Notlar)>();

            var klasorsuz = notlar.Where(n => n.KlasorId is null).ToList();
            if (klasorsuz.Count > 0)
                gruplar.Add(("Klasörsüz Notlar", false, klasorsuz));

            foreach (var k in klasorler)
            {
                var grpNotlar = notlar.Where(n => n.KlasorId == k.Id).ToList();
                gruplar.Add((k.Ad, k.SistemMi, grpNotlar));
            }

            var tarih = DateTimeOffset.Now.ToString("yyyy-MM-dd_HH-mm");

            return format?.ToLowerInvariant() switch
            {
                "html" => HtmlUret(gruplar, tarih),
                "pdf" => PdfUret(gruplar, tarih),
                "docx" => DocxUret(gruplar, tarih),
                "xlsx" => XlsxUret(gruplar, tarih),
                _ => Results.BadRequest(new { hata = "format parametresi: html | pdf | docx | xlsx" })
            };
        });
    }

    // ──────── HTML ────────
    private static IResult HtmlUret(List<(string Ad, bool SistemMi, List<Not> Notlar)> gruplar, string tarih)
    {
        var sb = new StringBuilder();
        sb.Append(@"<!DOCTYPE html>
<html lang='tr'>
<head>
<meta charset='utf-8'>
<title>Planlama Defterimiz</title>
<style>
@page { margin: 20mm; }
* { box-sizing: border-box; }
body { font-family: Georgia, 'Times New Roman', serif; color: #3d2817; background: #faf6ef; margin: 0; padding: 40px 24px; line-height: 1.65; }
.kart { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #ebe3d4; border-radius: 18px; padding: 56px 56px; }
h1.kapak { font-size: 38px; font-weight: 600; color: #3d2817; text-align: center; margin: 0; letter-spacing: -0.02em; }
.kapak-altyazi { text-align: center; color: #c4704d; font-style: italic; font-size: 15px; margin-top: 8px; letter-spacing: 0.05em; }
.kalp { text-align: center; font-size: 40px; color: #c4704d; margin: 14px 0 30px; }
.tarih { text-align: center; color: #9c8a73; font-size: 13px; margin: 30px 0 8px; }
.ozet { background: #faf6ef; border: 1px solid #ebe3d4; border-radius: 12px; padding: 18px 24px; margin: 26px 0 40px; display: flex; justify-content: space-around; flex-wrap: wrap; gap: 14px; }
.ozet-item { text-align: center; }
.ozet-item .sayi { font-size: 28px; font-weight: 600; color: #c4704d; display: block; }
.ozet-item .etiket { font-size: 11px; color: #5d4a37; letter-spacing: 0.08em; text-transform: uppercase; }
h2.klasor { font-size: 22px; color: #3d2817; margin: 50px 0 4px; padding-bottom: 8px; border-bottom: 2px solid #c4704d; display: flex; align-items: center; gap: 10px; }
.klasor-rozet { display: inline-block; background: #c4704d; color: #fff; font-size: 11px; padding: 3px 10px; border-radius: 10px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 500; vertical-align: middle; margin-left: 8px; letter-spacing: 0.05em; }
.klasor-ozet { color: #9c8a73; font-size: 12px; margin-bottom: 20px; font-style: italic; }
.not { background: #faf6ef; border-left: 3px solid #ebe3d4; border-radius: 0 10px 10px 0; padding: 18px 22px; margin: 14px 0; page-break-inside: avoid; }
.not.tamamlandi { border-left-color: #8b6f4e; opacity: 0.85; }
.not h3 { font-size: 16px; color: #3d2817; margin: 0 0 4px; font-weight: 600; }
.not.tamamlandi h3 { text-decoration: line-through; color: #5d4a37; }
.not .icerik { color: #5d4a37; font-size: 14px; margin: 8px 0 0; line-height: 1.75; text-align: justify; white-space: pre-wrap; }
.meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
.pill { display: inline-block; padding: 3px 10px; border-radius: 10px; font-size: 11px; font-weight: 500; }
.pill-zaman { background: #f5ede0; color: #8b6f4e; }
.pill-hatirlatici { background: #c4704d; color: #fff; }
.pill-tamamlandi { background: #d4e6d4; color: #4a6b4a; }
.tam-bilgi { background: #c4704d12; border-left: 3px solid #c4704d; padding: 10px 14px; margin-top: 10px; border-radius: 0 8px 8px 0; }
.tam-bilgi .ust { font-size: 11px; color: #8b6f4e; margin-bottom: 4px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
.tam-bilgi .met { color: #3d2817; font-size: 14px; white-space: pre-wrap; }
.bos-klasor { color: #9c8a73; font-size: 13px; font-style: italic; padding: 20px; text-align: center; }
.footer { text-align: center; color: #9c8a73; font-size: 11px; margin-top: 60px; padding-top: 24px; border-top: 1px solid #ebe3d4; }
@media print { body { background: #fff; } .kart { border: 0; padding: 0; } }
</style>
</head>
<body>
<div class='kart'>
<div class='kalp'>♡</div>
<h1 class='kapak'>Planlama Defterimiz</h1>
<p class='kapak-altyazi'>en mutlu günümüze giderken yazdıklarımız 🤍</p>
");
        var trZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul");
        var trSimdi = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, trZone);
        sb.Append($"<p class='tarih'>Dışa aktarım: {trSimdi:dd MMMM yyyy, HH:mm} (TR)</p>");

        // Özet kartı
        var toplamNot = gruplar.Sum(g => g.Notlar.Count);
        var tamamlanan = gruplar.Sum(g => g.Notlar.Count(n => n.Tamamlandi));
        var bekleyen = toplamNot - tamamlanan;
        var hatirlaticili = gruplar.Sum(g => g.Notlar.Count(n => n.HatirlatmaZamani.HasValue));
        sb.Append($@"
<div class='ozet'>
  <div class='ozet-item'><span class='sayi'>{gruplar.Count}</span><span class='etiket'>Klasör</span></div>
  <div class='ozet-item'><span class='sayi'>{toplamNot}</span><span class='etiket'>Toplam Not</span></div>
  <div class='ozet-item'><span class='sayi'>{tamamlanan}</span><span class='etiket'>Tamamlanan</span></div>
  <div class='ozet-item'><span class='sayi'>{bekleyen}</span><span class='etiket'>Bekleyen</span></div>
  <div class='ozet-item'><span class='sayi'>{hatirlaticili}</span><span class='etiket'>Hatırlatıcılı</span></div>
</div>
");

        // Klasör grupları
        foreach (var (ad, sistemMi, grpNotlar) in gruplar)
        {
            sb.Append($"<h2 class='klasor'>{(sistemMi ? "✓" : "📁")} {HtmlKac(ad)}");
            if (sistemMi) sb.Append("<span class='klasor-rozet'>SİSTEM</span>");
            sb.Append("</h2>");

            sb.Append($"<p class='klasor-ozet'>{grpNotlar.Count} not — {grpNotlar.Count(n => n.Tamamlandi)} tamamlandı, {grpNotlar.Count(n => !n.Tamamlandi)} bekliyor</p>");

            if (grpNotlar.Count == 0)
            {
                sb.Append("<div class='bos-klasor'>(Bu klasörde henüz not yok)</div>");
                continue;
            }

            foreach (var n in grpNotlar)
            {
                sb.Append($"<div class='not{(n.Tamamlandi ? " tamamlandi" : "")}'>");
                sb.Append($"<h3>{HtmlKac(n.Baslik)}</h3>");
                if (!string.IsNullOrWhiteSpace(n.Icerik))
                    sb.Append($"<div class='icerik'>{HtmlKac(n.Icerik)}</div>");

                sb.Append("<div class='meta'>");
                sb.Append($"<span class='pill pill-zaman'>📅 {TarihTr(n.OlusturmaZamani, trZone)}</span>");
                if (n.HatirlatmaZamani.HasValue)
                    sb.Append($"<span class='pill pill-hatirlatici'>⏰ {TarihTr(n.HatirlatmaZamani.Value, trZone)}</span>");
                if (n.Tamamlandi)
                    sb.Append($"<span class='pill pill-tamamlandi'>✓ Tamamlandı</span>");
                sb.Append("</div>");

                if (n.Tamamlandi && !string.IsNullOrWhiteSpace(n.TamamlanmaAciklamasi))
                {
                    sb.Append("<div class='tam-bilgi'>");
                    sb.Append($"<div class='ust'>{HtmlKac(n.TamamlayanKullanici?.AdSoyad ?? "")} tamamladı · {TarihTr(n.TamamlanmaZamani ?? DateTimeOffset.UtcNow, trZone)}</div>");
                    sb.Append($"<div class='met'>{HtmlKac(n.TamamlanmaAciklamasi)}</div>");
                    sb.Append("</div>");
                }
                sb.Append("</div>");
            }
        }

        sb.Append(@"
<div class='footer'>
  Planlama Defterimiz · notlar.dentlogicapp.com<br>
  Bu defter sadece ikimiz görüyoruz 🤍
</div>
</div>
</body>
</html>");

        var bytes = Encoding.UTF8.GetBytes(sb.ToString());
        return Results.File(bytes, "text/html; charset=utf-8", $"planlama-defterimiz-{tarih}.html");
    }

    // ──────── PDF (QuestPDF) ────────
    private static IResult PdfUret(List<(string Ad, bool SistemMi, List<Not> Notlar)> gruplar, string tarih)
    {
        var trZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul");
        var trSimdi = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, trZone);

        var TERRACOTTA = "#c4704d";
        var CLAY_900 = "#3d2817";
        var CLAY_700 = "#5d4a37";
        var CLAY_400 = "#9c8a73";
        var CREAM = "#faf6ef";
        var EBE = "#ebe3d4";

        var doc = QuestPDF.Fluent.Document.Create(container =>
        {
            // KAPAK SAYFASI
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(2, Unit.Centimetre);
                page.PageColor(Colors.White);
                page.DefaultTextStyle(x => x.FontFamily("Georgia").FontColor(CLAY_900));

                page.Content().Column(col =>
                {
                    col.Item().PaddingTop(120).AlignCenter().Text("♡").FontSize(64).FontColor(TERRACOTTA);
                    col.Item().PaddingTop(20).AlignCenter().Text("Planlama Defterimiz")
                        .FontSize(36).SemiBold().FontColor(CLAY_900);
                    col.Item().PaddingTop(8).AlignCenter().Text("en mutlu günümüze giderken yazdıklarımız 🤍")
                        .FontSize(13).Italic().FontColor(TERRACOTTA);
                    col.Item().PaddingTop(40).AlignCenter().Text($"Dışa aktarım: {trSimdi:dd MMMM yyyy, HH:mm} (TR)")
                        .FontSize(11).FontColor(CLAY_400);

                    // Özet
                    var toplamNot = gruplar.Sum(g => g.Notlar.Count);
                    var tamamlanan = gruplar.Sum(g => g.Notlar.Count(n => n.Tamamlandi));
                    var bekleyen = toplamNot - tamamlanan;
                    var hatirlaticili = gruplar.Sum(g => g.Notlar.Count(n => n.HatirlatmaZamani.HasValue));

                    col.Item().PaddingTop(40).Background(CREAM).Border(1).BorderColor(EBE).Padding(20).Row(row =>
                    {
                        void OzetItem(string sayi, string etiket)
                        {
                            row.RelativeItem().Column(c =>
                            {
                                c.Item().AlignCenter().Text(sayi).FontSize(22).SemiBold().FontColor(TERRACOTTA);
                                c.Item().AlignCenter().Text(etiket).FontSize(9).FontColor(CLAY_700);
                            });
                        }
                        OzetItem(gruplar.Count.ToString(), "KLASÖR");
                        OzetItem(toplamNot.ToString(), "TOPLAM NOT");
                        OzetItem(tamamlanan.ToString(), "TAMAMLANAN");
                        OzetItem(bekleyen.ToString(), "BEKLEYEN");
                        OzetItem(hatirlaticili.ToString(), "HATIRLATICILI");
                    });

                    col.Item().PaddingTop(80).AlignCenter().Text("─── ♡ ───").FontSize(14).FontColor(TERRACOTTA);
                });
            });

            // İÇERİK SAYFALARI
            foreach (var (ad, sistemMi, grpNotlar) in gruplar)
            {
                container.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.Margin(2, Unit.Centimetre);
                    page.PageColor(Colors.White);
                    page.DefaultTextStyle(x => x.FontFamily("Georgia").FontColor(CLAY_900));

                    page.Header().PaddingBottom(8).BorderBottom(2).BorderColor(TERRACOTTA).Row(row =>
                    {
                        row.AutoItem().AlignMiddle().Text(sistemMi ? "✓" : "📁").FontSize(16);
                        row.AutoItem().PaddingLeft(8).AlignMiddle().Text(ad).FontSize(20).SemiBold();
                        if (sistemMi)
                        {
                            row.AutoItem().PaddingLeft(10).AlignMiddle().Background(TERRACOTTA).Padding(3).Text("SİSTEM")
                                .FontFamily("Calibri").FontSize(8).FontColor(Colors.White);
                        }
                        row.RelativeItem().AlignRight().AlignMiddle().Text($"{grpNotlar.Count} not")
                            .FontSize(11).FontColor(CLAY_400).Italic();
                    });

                    page.Content().PaddingTop(16).Column(col =>
                    {
                        if (grpNotlar.Count == 0)
                        {
                            col.Item().PaddingVertical(20).AlignCenter()
                                .Text("(Bu klasörde henüz not yok)").Italic().FontColor(CLAY_400);
                            return;
                        }

                        foreach (var n in grpNotlar)
                        {
                            col.Item().PaddingVertical(8).Background(CREAM).BorderLeft(3)
                                .BorderColor(n.Tamamlandi ? CLAY_700 : EBE)
                                .Padding(14).Column(notCol =>
                            {
                                notCol.Item().Text(t =>
                                {
                                    t.Span(n.Baslik).FontSize(13).SemiBold()
                                        .FontColor(n.Tamamlandi ? CLAY_700 : CLAY_900);
                                    if (n.Tamamlandi) t.Span("  ✓").FontColor(TERRACOTTA);
                                });

                                if (!string.IsNullOrWhiteSpace(n.Icerik))
                                {
                                    notCol.Item().PaddingTop(6).Text(n.Icerik!)
                                        .FontSize(11).FontColor(CLAY_700).LineHeight(1.6f);
                                }

                                // Meta pill'leri
                                notCol.Item().PaddingTop(10).Row(metaRow =>
                                {
                                    metaRow.AutoItem().Background("#f5ede0").Padding(4)
                                        .Text($"📅 {TarihTr(n.OlusturmaZamani, trZone)}")
                                        .FontFamily("Calibri").FontSize(8).FontColor("#8b6f4e");

                                    if (n.HatirlatmaZamani.HasValue)
                                    {
                                        metaRow.AutoItem().PaddingLeft(5).Background(TERRACOTTA).Padding(4)
                                            .Text($"⏰ {TarihTr(n.HatirlatmaZamani.Value, trZone)}")
                                            .FontFamily("Calibri").FontSize(8).FontColor(Colors.White);
                                    }
                                    metaRow.RelativeItem();
                                });

                                if (n.Tamamlandi && !string.IsNullOrWhiteSpace(n.TamamlanmaAciklamasi))
                                {
                                    notCol.Item().PaddingTop(8).BorderLeft(2).BorderColor(TERRACOTTA)
                                        .Background("#fdf5ee").Padding(8).Column(tc =>
                                    {
                                        tc.Item().Text($"{n.TamamlayanKullanici?.AdSoyad ?? ""} tamamladı · {TarihTr(n.TamamlanmaZamani ?? DateTimeOffset.UtcNow, trZone)}")
                                            .FontFamily("Calibri").FontSize(8).FontColor("#8b6f4e");
                                        tc.Item().PaddingTop(3).Text(n.TamamlanmaAciklamasi!)
                                            .FontSize(10).FontColor(CLAY_900);
                                    });
                                }
                            });
                        }
                    });

                    page.Footer().AlignCenter().Text(t =>
                    {
                        t.Span("Planlama Defterimiz").FontSize(9).FontColor(CLAY_400);
                        t.Span("  ·  ").FontSize(9).FontColor(CLAY_400);
                        t.CurrentPageNumber().FontSize(9).FontColor(CLAY_400);
                        t.Span(" / ").FontSize(9).FontColor(CLAY_400);
                        t.TotalPages().FontSize(9).FontColor(CLAY_400);
                    });
                });
            }
        });

        var bytes = doc.GeneratePdf();
        return Results.File(bytes, "application/pdf", $"planlama-defterimiz-{tarih}.pdf");
    }

    // ──────── DOCX (DocumentFormat.OpenXml) ────────
    private static IResult DocxUret(List<(string Ad, bool SistemMi, List<Not> Notlar)> gruplar, string tarih)
    {
        var trZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul");
        var trSimdi = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, trZone);

        using var ms = new MemoryStream();
        using (var wordDoc = WordprocessingDocument.Create(ms, WordprocessingDocumentType.Document))
        {
            var mainPart = wordDoc.AddMainDocumentPart();
            mainPart.Document = new DocumentFormat.OpenXml.Wordprocessing.Document(new Body());
            var body = mainPart.Document.Body!;

            // Kapak
            body.AppendChild(MerkezBaslik("♡", 48, "C4704D"));
            body.AppendChild(MerkezBaslik("Planlama Defterimiz", 32, "3D2817"));
            body.AppendChild(MerkezParagraf("en mutlu günümüze giderken yazdıklarımız 🤍", 11, "C4704D", italic: true));
            body.AppendChild(MerkezParagraf($"Dışa aktarım: {trSimdi:dd MMMM yyyy, HH:mm} (TR)", 10, "9C8A73"));

            // Özet
            var toplamNot = gruplar.Sum(g => g.Notlar.Count);
            var tamamlanan = gruplar.Sum(g => g.Notlar.Count(n => n.Tamamlandi));
            var hatirlaticili = gruplar.Sum(g => g.Notlar.Count(n => n.HatirlatmaZamani.HasValue));
            body.AppendChild(BosParagraf());
            body.AppendChild(MerkezParagraf(
                $"📁 {gruplar.Count} klasör    ·    📝 {toplamNot} not    ·    ✓ {tamamlanan} tamamlandı    ·    ⏰ {hatirlaticili} hatırlatıcı",
                11, "5D4A37"));

            // Sayfa kırma
            body.AppendChild(SayfaKir());

            foreach (var (ad, sistemMi, grpNotlar) in gruplar)
            {
                // Klasör başlığı
                var baslikText = sistemMi ? $"✓ {ad}  [SİSTEM]" : $"📁 {ad}";
                body.AppendChild(MerkezBaslik(baslikText, 20, "3D2817", solHizala: true));
                body.AppendChild(MerkezParagraf(
                    $"{grpNotlar.Count} not — {grpNotlar.Count(n => n.Tamamlandi)} tamamlandı, {grpNotlar.Count(n => !n.Tamamlandi)} bekliyor",
                    10, "9C8A73", italic: true, solHizala: true));
                body.AppendChild(BosParagraf());

                if (grpNotlar.Count == 0)
                {
                    body.AppendChild(MerkezParagraf("(Bu klasörde henüz not yok)", 11, "9C8A73", italic: true));
                    body.AppendChild(BosParagraf());
                    continue;
                }

                foreach (var n in grpNotlar)
                {
                    // Not başlığı
                    body.AppendChild(MerkezBaslik(n.Tamamlandi ? $"{n.Baslik}  ✓" : n.Baslik, 14, "3D2817", solHizala: true));

                    if (!string.IsNullOrWhiteSpace(n.Icerik))
                        body.AppendChild(MerkezParagraf(n.Icerik!, 11, "5D4A37", solHizala: true, justify: true));

                    // Meta
                    var meta = $"📅 {TarihTr(n.OlusturmaZamani, trZone)}";
                    if (n.HatirlatmaZamani.HasValue)
                        meta += $"    ·    ⏰ {TarihTr(n.HatirlatmaZamani.Value, trZone)}";
                    body.AppendChild(MerkezParagraf(meta, 9, "8B6F4E", italic: true, solHizala: true));

                    if (n.Tamamlandi && !string.IsNullOrWhiteSpace(n.TamamlanmaAciklamasi))
                    {
                        body.AppendChild(MerkezParagraf(
                            $"➤ {n.TamamlayanKullanici?.AdSoyad ?? ""} tamamladı: \"{n.TamamlanmaAciklamasi}\"",
                            10, "5D4A37", solHizala: true));
                    }
                    body.AppendChild(BosParagraf());
                }
                body.AppendChild(BosParagraf());
            }

            mainPart.Document.Save();
        }

        return Results.File(ms.ToArray(),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            $"planlama-defterimiz-{tarih}.docx");
    }

    // DOCX helper'ları
    private static Paragraph MerkezBaslik(string text, int sizeHalfPoint, string colorHex, bool solHizala = false)
    {
        var pPr = new ParagraphProperties();
        if (!solHizala) pPr.AppendChild(new Justification { Val = JustificationValues.Center });
        pPr.AppendChild(new SpacingBetweenLines { Before = "120", After = "60" });

        var run = new Run(new Text(text) { Space = SpaceProcessingModeValues.Preserve });
        var rPr = new RunProperties();
        rPr.AppendChild(new Bold());
        rPr.AppendChild(new FontSize { Val = (sizeHalfPoint * 2).ToString() });
        rPr.AppendChild(new DocumentFormat.OpenXml.Wordprocessing.Color { Val = colorHex });
        rPr.AppendChild(new RunFonts { Ascii = "Georgia", HighAnsi = "Georgia" });
        run.PrependChild(rPr);

        var p = new Paragraph(pPr, run);
        return p;
    }

    private static Paragraph MerkezParagraf(string text, int sizeHalfPoint, string colorHex,
        bool italic = false, bool solHizala = false, bool justify = false)
    {
        var pPr = new ParagraphProperties();
        if (justify) pPr.AppendChild(new Justification { Val = JustificationValues.Both });
        else if (!solHizala) pPr.AppendChild(new Justification { Val = JustificationValues.Center });
        pPr.AppendChild(new SpacingBetweenLines { Before = "40", After = "40", Line = "300", LineRule = LineSpacingRuleValues.Auto });

        // Multi-line desteği için \n'leri Break ile böl
        var run = new Run();
        var rPr = new RunProperties();
        rPr.AppendChild(new FontSize { Val = (sizeHalfPoint * 2).ToString() });
        rPr.AppendChild(new DocumentFormat.OpenXml.Wordprocessing.Color { Val = colorHex });
        if (italic) rPr.AppendChild(new Italic());
        rPr.AppendChild(new RunFonts { Ascii = "Calibri", HighAnsi = "Calibri" });
        run.PrependChild(rPr);

        var lines = text.Split('\n');
        for (int i = 0; i < lines.Length; i++)
        {
            run.AppendChild(new Text(lines[i]) { Space = SpaceProcessingModeValues.Preserve });
            if (i < lines.Length - 1) run.AppendChild(new Break());
        }

        return new Paragraph(pPr, run);
    }

    private static Paragraph BosParagraf() => new Paragraph(new ParagraphProperties(
        new SpacingBetweenLines { Before = "80", After = "80" }));

    private static Paragraph SayfaKir() => new Paragraph(new Run(new Break { Type = BreakValues.Page }));

    // ──────── XLSX (ClosedXML) ────────
    private static IResult XlsxUret(List<(string Ad, bool SistemMi, List<Not> Notlar)> gruplar, string tarih)
    {
        var trZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul");

        using var wb = new XLWorkbook();

        // Özet sayfası
        var ozet = wb.Worksheets.Add("Özet");
        ozet.Cell("A1").Value = "Planlama Defterimiz";
        ozet.Cell("A1").Style.Font.FontSize = 24;
        ozet.Cell("A1").Style.Font.FontName = "Georgia";
        ozet.Cell("A1").Style.Font.FontColor = XLColor.FromHtml("#3D2817");
        ozet.Cell("A1").Style.Font.Bold = true;
        ozet.Range("A1:E1").Merge().Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

        ozet.Cell("A2").Value = "en mutlu günümüze giderken yazdıklarımız ♡";
        ozet.Cell("A2").Style.Font.Italic = true;
        ozet.Cell("A2").Style.Font.FontColor = XLColor.FromHtml("#C4704D");
        ozet.Range("A2:E2").Merge().Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

        ozet.Cell("A4").Value = "Klasör";
        ozet.Cell("B4").Value = "Toplam Not";
        ozet.Cell("C4").Value = "Tamamlanan";
        ozet.Cell("D4").Value = "Bekleyen";
        ozet.Cell("E4").Value = "Hatırlatıcılı";
        var basligi = ozet.Range("A4:E4");
        basligi.Style.Font.Bold = true;
        basligi.Style.Fill.BackgroundColor = XLColor.FromHtml("#C4704D");
        basligi.Style.Font.FontColor = XLColor.White;
        basligi.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

        int row = 5;
        foreach (var (ad, sistemMi, grpNotlar) in gruplar)
        {
            ozet.Cell(row, 1).Value = sistemMi ? $"✓ {ad}" : $"📁 {ad}";
            ozet.Cell(row, 2).Value = grpNotlar.Count;
            ozet.Cell(row, 3).Value = grpNotlar.Count(n => n.Tamamlandi);
            ozet.Cell(row, 4).Value = grpNotlar.Count(n => !n.Tamamlandi);
            ozet.Cell(row, 5).Value = grpNotlar.Count(n => n.HatirlatmaZamani.HasValue);
            if (row % 2 == 0)
                ozet.Range(row, 1, row, 5).Style.Fill.BackgroundColor = XLColor.FromHtml("#FAF6EF");
            row++;
        }
        ozet.Columns().AdjustToContents();
        ozet.Column(1).Width = Math.Max(ozet.Column(1).Width, 30);

        // Tüm notlar sayfası
        var hepsi = wb.Worksheets.Add("Tüm Notlar");
        hepsi.Cell("A1").Value = "Klasör";
        hepsi.Cell("B1").Value = "Başlık";
        hepsi.Cell("C1").Value = "İçerik";
        hepsi.Cell("D1").Value = "Durum";
        hepsi.Cell("E1").Value = "Tamamlanma Açıklaması";
        hepsi.Cell("F1").Value = "Hatırlatma Zamanı";
        hepsi.Cell("G1").Value = "Oluşturulma";
        hepsi.Cell("H1").Value = "Son Güncelleme";
        hepsi.Cell("I1").Value = "Oluşturan";

        var hb = hepsi.Range("A1:I1");
        hb.Style.Font.Bold = true;
        hb.Style.Fill.BackgroundColor = XLColor.FromHtml("#3D2817");
        hb.Style.Font.FontColor = XLColor.White;
        hb.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

        row = 2;
        foreach (var (ad, sistemMi, grpNotlar) in gruplar)
        {
            foreach (var n in grpNotlar)
            {
                hepsi.Cell(row, 1).Value = sistemMi ? $"✓ {ad}" : ad;
                hepsi.Cell(row, 2).Value = n.Baslik;
                hepsi.Cell(row, 3).Value = n.Icerik ?? "";
                hepsi.Cell(row, 4).Value = n.Tamamlandi ? "Tamamlandı" : "Bekliyor";
                hepsi.Cell(row, 5).Value = n.TamamlanmaAciklamasi ?? "";
                hepsi.Cell(row, 6).Value = n.HatirlatmaZamani.HasValue
                    ? TarihTr(n.HatirlatmaZamani.Value, trZone)
                    : "";
                hepsi.Cell(row, 7).Value = TarihTr(n.OlusturmaZamani, trZone);
                hepsi.Cell(row, 8).Value = TarihTr(n.GuncellemeZamani, trZone);
                hepsi.Cell(row, 9).Value = n.OlusturanKullanici?.AdSoyad ?? "";

                if (n.Tamamlandi)
                    hepsi.Range(row, 1, row, 9).Style.Fill.BackgroundColor = XLColor.FromHtml("#FAF6EF");
                row++;
            }
        }
        // Hücre içeriklerine göre genişlik (içerik kolonu için sınır)
        hepsi.Columns().AdjustToContents();
        hepsi.Column(3).Width = Math.Min(hepsi.Column(3).Width, 60);
        hepsi.Column(3).Style.Alignment.WrapText = true;
        hepsi.Column(5).Width = Math.Min(hepsi.Column(5).Width, 40);
        hepsi.Column(5).Style.Alignment.WrapText = true;
        hepsi.Range(2, 1, row - 1, 9).Style.Alignment.Vertical = XLAlignmentVerticalValues.Top;

        // Filtre + freeze
        hepsi.RangeUsed()!.SetAutoFilter();
        hepsi.SheetView.FreezeRows(1);

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return Results.File(ms.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"planlama-defterimiz-{tarih}.xlsx");
    }

    // ──────── Helpers ────────
    private static string HtmlKac(string? s) => WebUtility.HtmlEncode(s ?? "").Replace("\n", "<br>");

    private static string TarihTr(DateTimeOffset dt, TimeZoneInfo trZone) =>
        TimeZoneInfo.ConvertTime(dt, trZone)
            .ToString("dd MMM yyyy HH:mm", System.Globalization.CultureInfo.GetCultureInfo("tr-TR"));
}
