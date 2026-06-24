using System.Globalization;
using ClosedXML.Excel;
using Notlar.Api.Entities;

namespace Notlar.Api.Services;

/// <summary>
/// v14 — XLSX defter çıktısı (modernize edilmiş):
///   • Sheet 1: "Genel Bakış" — başlık + istatistikler + klasör listesi (TIKLANABILIR köprülerle)
///   • Her klasör için ayrı sheet (klasör adıyla)
///   • Tüm sheet'ler ReadOnly/Protected — düzenlemeye karşı korumalı (parolasız)
///     "Tek gerçek veri kaynağı uygulama arayüzü" prensibi.
///   • Davetiye paletinde başlık satırları (terracotta), alternatif satır renkleri,
///     dengeli kolon genişlikleri.
/// </summary>
public static class XlsxTasarimcisi
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

    // Davetiye paleti — XLSX'te de tutarlılık
    private static readonly XLColor Terracotta = XLColor.FromArgb(196, 112, 77);
    private static readonly XLColor TerracottaDark = XLColor.FromArgb(168, 90, 62);
    private static readonly XLColor CreamLight = XLColor.FromArgb(253, 250, 244);
    private static readonly XLColor CreamMedium = XLColor.FromArgb(243, 235, 218);
    private static readonly XLColor Clay900 = XLColor.FromArgb(42, 27, 15);
    private static readonly XLColor Clay700 = XLColor.FromArgb(78, 55, 34);
    private static readonly XLColor Clay500 = XLColor.FromArgb(138, 101, 65);
    private static readonly XLColor Amber50 = XLColor.FromArgb(255, 251, 235);
    private static readonly XLColor Yesil = XLColor.FromArgb(77, 110, 47);

    public static byte[] Uret(
        List<(string Ad, bool SistemMi, List<Not> Notlar)> gruplar,
        string markaAdi,
        SayacBilgi sayac)
    {
        using var wb = new XLWorkbook();
        var baslik = string.IsNullOrWhiteSpace(markaAdi) ? "Defter" : markaAdi;
        wb.Properties.Title = baslik;
        wb.Properties.Author = baslik;
        wb.Properties.Subject = "Notlar ve planlar";

        var sheetAdlari = new List<(string Orijinal, string Sheet, bool SistemMi, int NotSayisi, int Tamamlanan)>();

        // Sheet 1: Genel Bakış (placeholder, sheet'ler eklendikten sonra doldurulacak)
        var genelBakis = wb.Worksheets.Add("Genel Bakış");

        // Her klasör için ayrı sheet
        foreach (var (ad, sistemMi, notlar) in gruplar)
        {
            var sheetAdi = SheetAdiTemizle(ad, wb);
            sheetAdlari.Add((ad, sheetAdi, sistemMi, notlar.Count, notlar.Count(n => n.Tamamlandi)));
            KlasorSheetiYaz(wb, sheetAdi, ad, sistemMi, notlar);
        }

        // Şimdi Genel Bakış'ı doldur (sheet adları belli oldu, hyperlink kurabiliriz)
        GenelBakisYaz(genelBakis, baslik, sheetAdlari, sayac);

        // İlk sheet seçili açılsın
        genelBakis.SetTabActive();
        genelBakis.Position = 1;

        // Tüm sheet'leri koruma altına al (parolasız, sadece görsel inceleme)
        foreach (var ws in wb.Worksheets)
        {
            ws.Protect()
                .AllowElement(XLSheetProtectionElements.SelectLockedCells)
                .AllowElement(XLSheetProtectionElements.SelectUnlockedCells)
                .AllowElement(XLSheetProtectionElements.AutoFilter)
                .AllowElement(XLSheetProtectionElements.Sort);
        }

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    /// <summary>
    /// Sheet 1: Davetiye stilinde başlık + istatistik kartları + klasör listesi (tıklanabilir köprülerle)
    /// </summary>
    private static void GenelBakisYaz(IXLWorksheet ws, string baslik,
        List<(string Orijinal, string Sheet, bool SistemMi, int NotSayisi, int Tamamlanan)> klasorler,
        SayacBilgi sayac)
    {
        var bugun = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, IstanbulTz)
            .ToString("d MMMM yyyy", new CultureInfo("tr-TR"));
        var toplamNot = klasorler.Sum(k => k.NotSayisi);
        var toplamTamamlanan = klasorler.Sum(k => k.Tamamlanan);

        // === BAŞLIK BLOĞU ===
        ws.Cell("B2").Value = baslik;
        ws.Range("B2:F2").Merge();
        var basliki = ws.Cell("B2");
        basliki.Style.Font.FontName = "Calibri";
        basliki.Style.Font.FontSize = 28;
        basliki.Style.Font.Bold = false;
        basliki.Style.Font.Italic = true;
        basliki.Style.Font.FontColor = Terracotta;
        basliki.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        basliki.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        ws.Row(2).Height = 42;

        ws.Cell("B3").Value = "notlar ve planlar";
        ws.Range("B3:F3").Merge();
        var altyazi = ws.Cell("B3");
        altyazi.Style.Font.FontName = "Calibri";
        altyazi.Style.Font.FontSize = 11;
        altyazi.Style.Font.Italic = true;
        altyazi.Style.Font.FontColor = Clay700;
        altyazi.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

        // === İSTATİSTİK KARTLARI ===
        var istBaslangic = 5;
        IstatistikKart(ws, $"B{istBaslangic}", "TOPLAM NOT", toplamNot);
        IstatistikKart(ws, $"D{istBaslangic}", "TAMAMLANAN", toplamTamamlanan);
        if (sayac.Aktif)
            IstatistikKart(ws, $"F{istBaslangic}", sayac.Gecti ? "GÜN OLDU" : "GÜN KALDI", sayac.Gun);

        ws.Cell($"B{istBaslangic + 3}").Value = bugun;
        ws.Range($"B{istBaslangic + 3}:F{istBaslangic + 3}").Merge();
        var tarih = ws.Cell($"B{istBaslangic + 3}");
        tarih.Style.Font.FontName = "Calibri";
        tarih.Style.Font.FontSize = 10;
        tarih.Style.Font.Italic = true;
        tarih.Style.Font.FontColor = Clay500;
        tarih.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

        // === KLASÖR LİSTESİ BAŞLIĞI ===
        var listeBaslangic = istBaslangic + 5;
        ws.Cell($"B{listeBaslangic}").Value = "📁 Klasörler";
        ws.Range($"B{listeBaslangic}:F{listeBaslangic}").Merge();
        var listeBasligi = ws.Cell($"B{listeBaslangic}");
        listeBasligi.Style.Font.FontName = "Calibri";
        listeBasligi.Style.Font.FontSize = 14;
        listeBasligi.Style.Font.Bold = true;
        listeBasligi.Style.Font.FontColor = Clay900;
        listeBasligi.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        ws.Row(listeBaslangic).Height = 30;

        // === KLASÖR TABLOSU ===
        var tabloBaslangic = listeBaslangic + 2;
        // Tablo başlıkları
        ws.Cell($"B{tabloBaslangic}").Value = "#";
        ws.Cell($"C{tabloBaslangic}").Value = "Klasör";
        ws.Cell($"D{tabloBaslangic}").Value = "Tip";
        ws.Cell($"E{tabloBaslangic}").Value = "Not";
        ws.Cell($"F{tabloBaslangic}").Value = "Tamamlanan";
        var baslikSatiri = ws.Range($"B{tabloBaslangic}:F{tabloBaslangic}");
        baslikSatiri.Style.Fill.BackgroundColor = Terracotta;
        baslikSatiri.Style.Font.FontColor = CreamLight;
        baslikSatiri.Style.Font.Bold = true;
        baslikSatiri.Style.Font.FontName = "Calibri";
        baslikSatiri.Style.Font.FontSize = 11;
        baslikSatiri.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        baslikSatiri.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Left;
        ws.Cell($"B{tabloBaslangic}").Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        ws.Cell($"E{tabloBaslangic}").Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        ws.Cell($"F{tabloBaslangic}").Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        ws.Row(tabloBaslangic).Height = 26;

        // Tablo satırları
        for (int i = 0; i < klasorler.Count; i++)
        {
            var k = klasorler[i];
            var row = tabloBaslangic + 1 + i;
            var ciftSatir = i % 2 == 1;

            ws.Cell($"B{row}").Value = i + 1;
            ws.Cell($"B{row}").Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Cell($"B{row}").Style.Font.FontColor = Terracotta;
            ws.Cell($"B{row}").Style.Font.Bold = true;

            // KLASÖR ADI + HYPERLINK (Musa'nın naçizane isteği — tıklanır köprü)
            var adHucresi = ws.Cell($"C{row}");
            adHucresi.Value = k.Orijinal;
            adHucresi.SetHyperlink(new XLHyperlink($"'{k.Sheet}'!A1", $"Klasörü aç: {k.Orijinal}"));
            adHucresi.Style.Font.FontColor = TerracottaDark;
            adHucresi.Style.Font.Bold = true;
            adHucresi.Style.Font.Underline = XLFontUnderlineValues.Single;

            ws.Cell($"D{row}").Value = k.SistemMi ? "sistem" : "kullanıcı";
            ws.Cell($"D{row}").Style.Font.FontColor = k.SistemMi ? Terracotta : Clay500;
            ws.Cell($"D{row}").Style.Font.FontSize = 10;
            ws.Cell($"D{row}").Style.Font.Italic = true;

            ws.Cell($"E{row}").Value = k.NotSayisi;
            ws.Cell($"E{row}").Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Cell($"E{row}").Style.Font.FontColor = Clay900;

            ws.Cell($"F{row}").Value = k.Tamamlanan;
            ws.Cell($"F{row}").Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Cell($"F{row}").Style.Font.FontColor = Yesil;
            ws.Cell($"F{row}").Style.Font.Bold = true;

            var satir = ws.Range($"B{row}:F{row}");
            satir.Style.Font.FontName = "Calibri";
            satir.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            satir.Style.Border.BottomBorder = XLBorderStyleValues.Thin;
            satir.Style.Border.BottomBorderColor = CreamMedium;
            if (ciftSatir) satir.Style.Fill.BackgroundColor = CreamLight;
            ws.Row(row).Height = 22;
        }

        // Kolon genişlikleri
        ws.Column("A").Width = 2;
        ws.Column("B").Width = 6;
        ws.Column("C").Width = 42;
        ws.Column("D").Width = 14;
        ws.Column("E").Width = 10;
        ws.Column("F").Width = 14;
        ws.Column("G").Width = 2;

        // Tipografi default
        ws.Style.Font.FontName = "Calibri";

        // Dipnot
        var dipRow = tabloBaslangic + 1 + klasorler.Count + 2;
        ws.Cell($"B{dipRow}").Value = "ℹ Klasör adına tıklayarak ilgili sheet'e atlayabilirsin.";
        ws.Range($"B{dipRow}:F{dipRow}").Merge();
        ws.Cell($"B{dipRow}").Style.Font.FontColor = Clay500;
        ws.Cell($"B{dipRow}").Style.Font.FontSize = 9;
        ws.Cell($"B{dipRow}").Style.Font.Italic = true;
    }

    private static void IstatistikKart(IXLWorksheet ws, string anchor, string etiket, int sayi)
    {
        var hucre = ws.Cell(anchor);
        var sutun = anchor[0];
        var satir = int.Parse(anchor.Substring(1));

        // Sayı
        hucre.Value = sayi;
        hucre.Style.Font.FontName = "Calibri";
        hucre.Style.Font.FontSize = 22;
        hucre.Style.Font.Bold = true;
        hucre.Style.Font.FontColor = Terracotta;
        hucre.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        hucre.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        ws.Row(satir).Height = 32;

        // Etiket (alt satır)
        var etiketSatiri = satir + 1;
        var etiketHucre = ws.Cell($"{sutun}{etiketSatiri}");
        etiketHucre.Value = etiket;
        etiketHucre.Style.Font.FontName = "Calibri";
        etiketHucre.Style.Font.FontSize = 9;
        etiketHucre.Style.Font.FontColor = Clay500;
        etiketHucre.Style.Font.Bold = false;
        etiketHucre.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

        // Kart çerçevesi
        var kart = ws.Range($"{sutun}{satir}:{sutun}{etiketSatiri}");
        kart.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
        kart.Style.Border.OutsideBorderColor = CreamMedium;
        kart.Style.Fill.BackgroundColor = CreamLight;
    }

    /// <summary>
    /// Bir klasörün notlarını detaylı tablo olarak yazar.
    /// </summary>
    private static void KlasorSheetiYaz(XLWorkbook wb, string sheetAdi, string orijinalAd,
        bool sistemMi, List<Not> notlar)
    {
        var ws = wb.Worksheets.Add(sheetAdi);

        // === BAŞLIK ===
        ws.Cell("B2").Value = orijinalAd;
        ws.Range("B2:G2").Merge();
        var basliki = ws.Cell("B2");
        basliki.Style.Font.FontName = "Calibri";
        basliki.Style.Font.FontSize = 22;
        basliki.Style.Font.Italic = true;
        basliki.Style.Font.FontColor = Clay900;
        basliki.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        ws.Row(2).Height = 34;

        // Üst-sağ köşede "← Genel Bakış'a dön" linki
        var donHucresi = ws.Cell("G2");
        // Merge sonra link kaybolabilir, ayrı bir satıra koyalım
        ws.Range("B2:G2").Unmerge();
        ws.Range("B2:F2").Merge();
        ws.Cell("G2").Value = "← Genel Bakış";
        ws.Cell("G2").SetHyperlink(new XLHyperlink("'Genel Bakış'!A1", "Genel Bakış sayfasına dön"));
        ws.Cell("G2").Style.Font.FontColor = Terracotta;
        ws.Cell("G2").Style.Font.FontSize = 9;
        ws.Cell("G2").Style.Font.Italic = true;
        ws.Cell("G2").Style.Font.Underline = XLFontUnderlineValues.Single;
        ws.Cell("G2").Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
        ws.Cell("G2").Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;

        // Alt-yazı
        var alt = ws.Cell("B3");
        alt.Value = sistemMi
            ? $"sistem klasörü · {notlar.Count} not"
            : $"{notlar.Count} not · {notlar.Count(n => n.Tamamlandi)} tamamlandı";
        ws.Range("B3:G3").Merge();
        alt.Style.Font.FontName = "Calibri";
        alt.Style.Font.FontSize = 10;
        alt.Style.Font.Italic = true;
        alt.Style.Font.FontColor = Clay500;

        if (notlar.Count == 0)
        {
            ws.Cell("B5").Value = "Bu klasörde henüz not yok.";
            ws.Range("B5:G5").Merge();
            ws.Cell("B5").Style.Font.Italic = true;
            ws.Cell("B5").Style.Font.FontColor = Clay500;
            ws.Cell("B5").Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Cell("B5").Style.Font.FontName = "Calibri";
            VarsayilanlariYerlestir(ws);
            return;
        }

        // === TABLO BAŞLIĞI ===
        var tabloBaslangic = 5;
        ws.Cell($"B{tabloBaslangic}").Value = "#";
        ws.Cell($"C{tabloBaslangic}").Value = "Başlık";
        ws.Cell($"D{tabloBaslangic}").Value = "İçerik";
        ws.Cell($"E{tabloBaslangic}").Value = "Yazan";
        ws.Cell($"F{tabloBaslangic}").Value = "Tarih";
        ws.Cell($"G{tabloBaslangic}").Value = "Durum";

        var baslikSatiri = ws.Range($"B{tabloBaslangic}:G{tabloBaslangic}");
        baslikSatiri.Style.Fill.BackgroundColor = Terracotta;
        baslikSatiri.Style.Font.FontColor = CreamLight;
        baslikSatiri.Style.Font.Bold = true;
        baslikSatiri.Style.Font.FontName = "Calibri";
        baslikSatiri.Style.Font.FontSize = 11;
        baslikSatiri.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        ws.Row(tabloBaslangic).Height = 26;

        // === TABLO SATIRLARI ===
        for (int i = 0; i < notlar.Count; i++)
        {
            var n = notlar[i];
            var row = tabloBaslangic + 1 + i;
            var ciftSatir = i % 2 == 1;

            ws.Cell($"B{row}").Value = i + 1;
            ws.Cell($"C{row}").Value = n.Baslik;
            ws.Cell($"D{row}").Value = string.IsNullOrWhiteSpace(n.Icerik) ? "—" : n.Icerik;
            ws.Cell($"E{row}").Value = n.OlusturanKullanici?.AdSoyad ?? "—";
            ws.Cell($"F{row}").Value = TimeZoneInfo.ConvertTime(n.OlusturmaZamani, IstanbulTz)
                .ToString("dd.MM.yyyy HH:mm", new CultureInfo("tr-TR"));
            ws.Cell($"G{row}").Value = n.Tamamlandi ? "✓ Tamamlandı" : "○ Bekliyor";

            ws.Cell($"B{row}").Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Cell($"B{row}").Style.Font.FontColor = Terracotta;
            ws.Cell($"B{row}").Style.Font.Bold = true;

            ws.Cell($"C{row}").Style.Font.Bold = true;
            ws.Cell($"C{row}").Style.Font.FontColor = Clay900;

            ws.Cell($"D{row}").Style.Alignment.WrapText = true;
            ws.Cell($"D{row}").Style.Font.FontColor = Clay700;

            ws.Cell($"E{row}").Style.Font.FontColor = Clay500;
            ws.Cell($"E{row}").Style.Font.FontSize = 10;

            ws.Cell($"F{row}").Style.Font.FontColor = Clay500;
            ws.Cell($"F{row}").Style.Font.FontSize = 10;

            ws.Cell($"G{row}").Style.Font.FontColor = n.Tamamlandi ? Yesil : Clay500;
            ws.Cell($"G{row}").Style.Font.Bold = true;
            ws.Cell($"G{row}").Style.Font.FontSize = 10;
            ws.Cell($"G{row}").Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            var satir = ws.Range($"B{row}:G{row}");
            satir.Style.Font.FontName = "Calibri";
            satir.Style.Alignment.Vertical = XLAlignmentVerticalValues.Top;
            satir.Style.Border.BottomBorder = XLBorderStyleValues.Thin;
            satir.Style.Border.BottomBorderColor = CreamMedium;
            if (ciftSatir) satir.Style.Fill.BackgroundColor = CreamLight;

            // Satır yüksekliği içeriğe göre (kabaca)
            var icerikUzunluk = n.Icerik?.Length ?? 0;
            var minH = 26;
            var hesap = Math.Min(140, minH + (icerikUzunluk / 60) * 14);
            ws.Row(row).Height = hesap;
        }

        VarsayilanlariYerlestir(ws);
    }

    private static void VarsayilanlariYerlestir(IXLWorksheet ws)
    {
        ws.Column("A").Width = 2;
        ws.Column("B").Width = 5;
        ws.Column("C").Width = 32;
        ws.Column("D").Width = 60;
        ws.Column("E").Width = 18;
        ws.Column("F").Width = 18;
        ws.Column("G").Width = 16;
        ws.Column("H").Width = 2;

        ws.Style.Font.FontName = "Calibri";
    }

    /// <summary>
    /// Excel sheet adı sınırlamaları:
    ///   • Maks 31 karakter
    ///   • Yasak karakterler: : \ / ? * [ ]
    ///   • Aynı workbook'ta unique
    /// </summary>
    private static string SheetAdiTemizle(string ad, XLWorkbook wb)
    {
        var temiz = new string(ad
            .Where(c => c != ':' && c != '\\' && c != '/' && c != '?' && c != '*' && c != '[' && c != ']')
            .ToArray());
        if (temiz.Length > 31) temiz = temiz.Substring(0, 31);
        if (string.IsNullOrWhiteSpace(temiz)) temiz = "Klasör";

        // Unique kontrol
        if (!wb.Worksheets.Any(w => w.Name.Equals(temiz, StringComparison.OrdinalIgnoreCase)))
            return temiz;

        var taban = temiz.Length > 28 ? temiz.Substring(0, 28) : temiz;
        for (int n = 2; n < 999; n++)
        {
            var aday = $"{taban} ({n})";
            if (!wb.Worksheets.Any(w => w.Name.Equals(aday, StringComparison.OrdinalIgnoreCase)))
                return aday;
        }
        return Guid.NewGuid().ToString("N").Substring(0, 8);
    }
}
