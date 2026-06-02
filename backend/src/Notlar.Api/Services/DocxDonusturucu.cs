using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using System.Globalization;
using Notlar.Api.Entities;

namespace Notlar.Api.Services;

/// <summary>
/// v14 — Native DOCX üretici (HTML köprüsü yok).
/// Davetiye paletinde, Word'de açıldığında doğrudan profesyonel görünüm.
/// Brand renkleri OpenXml stilleri olarak kaydedilir, doğru tipografi (Georgia + Calibri).
/// </summary>
public interface IDocxDonusturucu
{
    Task<byte[]> UretAsync(
        List<(string Ad, bool SistemMi, List<Not> Notlar)> gruplar,
        string ciftIsmi,
        DateTime dugunTarihi,
        CancellationToken ct = default);
}

public sealed class DocxDonusturucu : IDocxDonusturucu
{
    private static readonly TimeZoneInfo IstanbulTz =
        TryFindIstanbulTz() ?? TimeZoneInfo.Utc;

    private static TimeZoneInfo? TryFindIstanbulTz()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul"); }
        catch { }
        try { return TimeZoneInfo.FindSystemTimeZoneById("Turkey Standard Time"); }
        catch { }
        return null;
    }

    // Davetiye paleti (hex)
    private const string Terracotta = "C4704D";
    private const string TerracottaDark = "A85A3E";
    private const string Clay900 = "2A1B0F";
    private const string Clay700 = "4E3722";
    private const string Clay500 = "8A6541";
    private const string CreamLight = "FDFAF4";
    private const string CreamMedium = "F3EBDA";
    private const string Border = "EBE3D4";
    private const string Yesil = "4D6E2F";
    private const string AmberBg = "FFFBEB";
    private const string AmberDk = "78350F";

    public Task<byte[]> UretAsync(
        List<(string Ad, bool SistemMi, List<Not> Notlar)> gruplar,
        string ciftIsmi,
        DateTime dugunTarihi,
        CancellationToken ct = default)
    {
        return Task.Run(() =>
        {
            using var ms = new MemoryStream();
            using (var doc = WordprocessingDocument.Create(ms, WordprocessingDocumentType.Document))
            {
                var main = doc.AddMainDocumentPart();
                main.Document = new Document();
                var body = new Body();
                main.Document.Append(body);

                IcerikYaz(body, gruplar, ciftIsmi, dugunTarihi);

                // Sayfa boyutu A4 + kenar boşlukları (en sonra)
                body.Append(SayfaAyari());

                main.Document.Save();
            }
            return ms.ToArray();
        }, ct);
    }

    private void IcerikYaz(Body body,
        List<(string Ad, bool SistemMi, List<Not> Notlar)> gruplar,
        string ciftIsmi, DateTime dugunTarihi)
    {
        var bugun = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, IstanbulTz)
            .ToString("d MMMM yyyy", new CultureInfo("tr-TR"));
        var kalanGun = Math.Max(0, (dugunTarihi - DateTime.UtcNow.Date).Days);
        var toplamNot = gruplar.Sum(g => g.Notlar.Count);
        var toplamTamamlanan = gruplar.Sum(g => g.Notlar.Count(n => n.Tamamlandi));

        // ─── KAPAK ───
        body.Append(BosSatir(4));
        body.Append(MetinSatiri("♡", "Georgia", 56, Terracotta, ortala: true));
        body.Append(BosSatir(1));
        body.Append(MetinSatiri("Planlama Defterimiz", "Georgia", 36, Clay900, italik: true, ortala: true));
        body.Append(BosSatir(1));
        body.Append(MetinSatiri("en mutlu günümüze giderken yazdıklarımız",
            "Georgia", 13, Clay700, italik: true, ortala: true));
        body.Append(BosSatir(2));

        // İstatistik kartları (tek tablo, 3 hücre)
        body.Append(IstatistikTablosu(toplamNot, toplamTamamlanan, kalanGun));
        body.Append(BosSatir(2));

        body.Append(MetinSatiri(bugun, "Georgia", 12, Clay500, italik: true, ortala: true));
        body.Append(BosSatir(1));
        body.Append(MetinSatiri(ciftIsmi, "Georgia", 18, Clay900, ortala: true));

        body.Append(SayfaSonu());

        // ─── İÇİNDEKİLER ───
        body.Append(MetinSatiri("İçindekiler", "Georgia", 24, Clay900, italik: true, ortala: true));
        body.Append(AyracCizgi());
        body.Append(BosSatir(1));

        int sira = 1;
        foreach (var (ad, sistemMi, notlar) in gruplar)
        {
            var sistemEk = sistemMi ? "  •  sistem" : "";
            body.Append(MetinSatiri(
                $"{sira:D2}.   {ad}{sistemEk}   ·   {notlar.Count} not",
                "Calibri", 11, Clay700));
            sira++;
        }

        // v14-hotfix3 — Her klasör KENDI sayfa sonunu KlasorBolumuYaz başında ekler,
        // burada ekstra sayfa sonu eklemiyoruz (yoksa çift sayfa boşluğu olur).

        // ─── HER KLASÖR ───
        foreach (var (ad, sistemMi, notlar) in gruplar)
        {
            KlasorBolumuYaz(body, ad, sistemMi, notlar);
        }
    }

    private void KlasorBolumuYaz(Body body, string ad, bool sistemMi, List<Not> notlar)
    {
        // v14-hotfix3 — Her klasör yeni sayfadan başlar (HTML'deki page-break-before ile aynı disiplin)
        body.Append(SayfaSonu());

        // Açılış
        body.Append(BosSatir(3));
        body.Append(MetinSatiri("♡", "Georgia", 28, Terracotta, ortala: true));
        body.Append(BosSatir(1));
        body.Append(MetinSatiri(ad, "Georgia", 28, Clay900, italik: true, ortala: true));

        if (sistemMi)
        {
            body.Append(MetinSatiri("sistem klasörü", "Calibri", 10, Terracotta,
                italik: true, ortala: true));
        }

        body.Append(BosSatir(1));
        var tamamlanan = notlar.Count(n => n.Tamamlandi);
        var bekleyen = notlar.Count - tamamlanan;
        body.Append(MetinSatiri(
            $"{notlar.Count} not   ·   {tamamlanan} tamamlandı   ·   {bekleyen} bekliyor",
            "Calibri", 11, Clay700, italik: true, ortala: true));
        body.Append(AyracCizgi());
        body.Append(BosSatir(1));

        if (notlar.Count == 0)
        {
            body.Append(MetinSatiri("Bu klasörde henüz hiç notumuz yok.",
                "Georgia", 12, Clay500, italik: true, ortala: true));
            return;
        }

        foreach (var n in notlar)
        {
            NotKartiYaz(body, n);
        }
    }

    private void NotKartiYaz(Body body, Not n)
    {
        // Başlık satırı
        var basEk = n.Tamamlandi ? "✓  " : "";
        body.Append(MetinSatiri(basEk + n.Baslik, "Georgia", 14, Clay900, kalin: true));

        // İçerik
        if (!string.IsNullOrWhiteSpace(n.Icerik))
        {
            foreach (var paragraf in n.Icerik.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var temiz = paragraf.Trim();
                if (temiz.Length > 0)
                    body.Append(MetinSatiri(temiz, "Calibri", 11, Clay700));
            }
        }

        // Tamamlama açıklaması
        if (n.Tamamlandi && !string.IsNullOrWhiteSpace(n.TamamlanmaAciklamasi))
        {
            body.Append(BosSatir(1));
            body.Append(KutulanmisMetin(
                "TAMAMLAMA AÇIKLAMASI",
                n.TamamlanmaAciklamasi,
                $"{n.TamamlayanKullanici?.AdSoyad ?? "—"} · " +
                    (n.TamamlanmaZamani.HasValue
                        ? TimeZoneInfo.ConvertTime(n.TamamlanmaZamani.Value, IstanbulTz)
                            .ToString("d MMMM yyyy · HH:mm", new CultureInfo("tr-TR"))
                        : "—")));
        }

        // Meta
        var meta = "✏ " + (n.OlusturanKullanici?.AdSoyad ?? "—") + "   ·   ⏱ " +
            TimeZoneInfo.ConvertTime(n.OlusturmaZamani, IstanbulTz)
                .ToString("d MMMM yyyy · HH:mm", new CultureInfo("tr-TR"));
        if (n.HatirlatmaZamani.HasValue)
        {
            meta += "   ·   🔔 " + TimeZoneInfo.ConvertTime(n.HatirlatmaZamani.Value, IstanbulTz)
                .ToString("d MMMM yyyy · HH:mm", new CultureInfo("tr-TR"));
        }
        body.Append(MetinSatiri(meta, "Calibri", 9, Clay500, italik: true));

        // Ayraç
        body.Append(AyracIncecik());
        body.Append(BosSatir(1));
    }

    // ─────────────── YARDIMCILAR ───────────────

    private static Paragraph BosSatir(int kez)
    {
        var p = new Paragraph();
        for (int i = 0; i < kez; i++)
            p.AppendChild(new Run(new Break()));
        return p;
    }

    private static Paragraph MetinSatiri(string metin, string font, int yariPt,
        string renkHex, bool kalin = false, bool italik = false, bool ortala = false)
    {
        var p = new Paragraph();
        var pp = new ParagraphProperties();
        if (ortala) pp.Append(new Justification { Val = JustificationValues.Center });
        pp.Append(new SpacingBetweenLines { After = "120", Line = "300", LineRule = LineSpacingRuleValues.Auto });
        p.AppendChild(pp);

        var rp = new RunProperties();
        rp.Append(new RunFonts { Ascii = font, HighAnsi = font });
        rp.Append(new FontSize { Val = (yariPt * 2).ToString() });  // OpenXml half-points
        rp.Append(new Color { Val = renkHex });
        if (kalin) rp.Append(new Bold());
        if (italik) rp.Append(new Italic());

        var run = new Run();
        run.Append(rp);
        run.Append(new Text(metin) { Space = SpaceProcessingModeValues.Preserve });
        p.Append(run);
        return p;
    }

    private static Table IstatistikTablosu(int notSayisi, int tamamlanan, int kalanGun)
    {
        var tbl = new Table();
        var tblProps = new TableProperties(
            new TableWidth { Width = "5000", Type = TableWidthUnitValues.Pct },
            new TableJustification { Val = TableRowAlignmentValues.Center },
            new TableBorders(
                new TopBorder { Val = BorderValues.Single, Color = Border, Size = 4 },
                new BottomBorder { Val = BorderValues.Single, Color = Border, Size = 4 },
                new LeftBorder { Val = BorderValues.Single, Color = Border, Size = 4 },
                new RightBorder { Val = BorderValues.Single, Color = Border, Size = 4 },
                new InsideHorizontalBorder { Val = BorderValues.Single, Color = Border, Size = 4 },
                new InsideVerticalBorder { Val = BorderValues.Single, Color = Border, Size = 4 }
            )
        );
        tbl.Append(tblProps);

        var tr = new TableRow();
        tr.Append(IstatistikHucresi(notSayisi.ToString(), "not"));
        tr.Append(IstatistikHucresi(tamamlanan.ToString(), "tamamlandı"));
        tr.Append(IstatistikHucresi(kalanGun.ToString(), "gün kaldı"));
        tbl.Append(tr);

        return tbl;
    }

    private static TableCell IstatistikHucresi(string sayi, string etiket)
    {
        var tc = new TableCell();
        var tcp = new TableCellProperties(
            new TableCellWidth { Width = "1666", Type = TableWidthUnitValues.Pct },
            new Shading { Val = ShadingPatternValues.Clear, Color = "auto", Fill = CreamLight },
            new TableCellMargin(
                new TopMargin { Width = "100", Type = TableWidthUnitValues.Dxa },
                new BottomMargin { Width = "100", Type = TableWidthUnitValues.Dxa }
            )
        );
        tc.Append(tcp);

        tc.Append(MetinSatiri(sayi, "Georgia", 24, Terracotta, kalin: true, ortala: true));
        tc.Append(MetinSatiri(etiket, "Calibri", 9, Clay500, ortala: true));
        return tc;
    }

    private static Paragraph AyracCizgi()
    {
        var p = new Paragraph();
        var pp = new ParagraphProperties();
        pp.Append(new Justification { Val = JustificationValues.Center });
        pp.Append(new ParagraphBorders(
            new BottomBorder { Val = BorderValues.Single, Color = Terracotta, Size = 6, Space = 1 }
        ));
        p.Append(pp);
        return p;
    }

    private static Paragraph AyracIncecik()
    {
        var p = new Paragraph();
        var pp = new ParagraphProperties();
        pp.Append(new ParagraphBorders(
            new BottomBorder { Val = BorderValues.Dotted, Color = Border, Size = 4, Space = 1 }
        ));
        p.Append(pp);
        return p;
    }

    private static Paragraph KutulanmisMetin(string baslik, string icerik, string meta)
    {
        // OpenXml'de "kutulu metin" için arkaplanlı paragraf + sol kenar şeridi
        var p = new Paragraph();
        var pp = new ParagraphProperties();
        pp.Append(new Shading { Val = ShadingPatternValues.Clear, Color = "auto", Fill = AmberBg });
        pp.Append(new ParagraphBorders(
            new LeftBorder { Val = BorderValues.Single, Color = "FBBF24", Size = 24, Space = 4 }
        ));
        pp.Append(new SpacingBetweenLines { Before = "100", After = "100", Line = "280", LineRule = LineSpacingRuleValues.Auto });
        pp.Append(new Indentation { Left = "240" });
        p.Append(pp);

        // Başlık run'ı
        var rp1 = new RunProperties();
        rp1.Append(new RunFonts { Ascii = "Calibri", HighAnsi = "Calibri" });
        rp1.Append(new FontSize { Val = "18" });
        rp1.Append(new Color { Val = AmberDk });
        rp1.Append(new Bold());
        rp1.Append(new Caps());
        var r1 = new Run(rp1, new Text(baslik) { Space = SpaceProcessingModeValues.Preserve });
        p.Append(r1);
        p.Append(new Run(new Break()));

        // İçerik run'ı
        var rp2 = new RunProperties();
        rp2.Append(new RunFonts { Ascii = "Calibri", HighAnsi = "Calibri" });
        rp2.Append(new FontSize { Val = "22" });
        rp2.Append(new Color { Val = Clay700 });
        var r2 = new Run(rp2, new Text(icerik) { Space = SpaceProcessingModeValues.Preserve });
        p.Append(r2);
        p.Append(new Run(new Break()));

        // Meta run'ı
        var rp3 = new RunProperties();
        rp3.Append(new RunFonts { Ascii = "Calibri", HighAnsi = "Calibri" });
        rp3.Append(new FontSize { Val = "16" });
        rp3.Append(new Color { Val = Clay500 });
        rp3.Append(new Italic());
        var r3 = new Run(rp3, new Text(meta) { Space = SpaceProcessingModeValues.Preserve });
        p.Append(r3);

        return p;
    }

    private static Paragraph SayfaSonu()
    {
        var p = new Paragraph();
        var r = new Run();
        r.Append(new Break { Type = BreakValues.Page });
        p.Append(r);
        return p;
    }

    private static SectionProperties SayfaAyari()
    {
        return new SectionProperties(
            new PageSize { Width = 11906, Height = 16838 },     // A4 (210x297 mm twentieths-of-a-point)
            new PageMargin
            {
                Top = 1134,    // ~2cm
                Right = 1134,
                Bottom = 1134,
                Left = 1134,
                Header = 720,
                Footer = 720,
                Gutter = 0
            }
        );
    }
}
