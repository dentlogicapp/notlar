using System.Globalization;
using ClosedXML.Excel;
using static Notlar.Api.Services.XlsxPaleti;

namespace Notlar.Api.Services;

/// <summary>
/// v21 M7 + B3 - KVKK onam sicili XLSX (salt-okunur hukuki kanit tablosu).
/// XlsxPaleti (ortak XLSX renk kaynagi) + Protect() read-only deseni - DefteriIndir
/// XlsxTasarimcisi ile ayni disiplin (Bolum 3: paralel yapi yok).
/// Tek sheet: onam kayitlari (kim / e-posta / versiyon / pazarlama / IP / tarayici / zaman).
/// KullaniciAjan (tarayici) sutunu B4 kapsaminda dahildir - denetim zinciri tam.
/// </summary>
public static class KvkkOnamXlsxTasarimcisi
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

    public static byte[] Uret(string markaAdi, IReadOnlyList<KvkkOnamSicilSatiri> kayitlar)
    {
        var baslik = string.IsNullOrWhiteSpace(markaAdi) ? "Planlama Defteri" : markaAdi;

        using var wb = new XLWorkbook();
        wb.Properties.Title = $"{baslik} - KVKK Onam Kayitlari";
        wb.Properties.Author = baslik;
        wb.Properties.Subject = "KVKK onam sicili (salt-okunur hukuki kanit)";

        var ws = wb.Worksheets.Add("Onam Kayitlari");

        // === BASLIK BLOGU ===
        ws.Cell("B2").Value = baslik;
        ws.Range("B2:H2").Merge();
        ws.Cell("B2").Style.Font.FontName = "Georgia";
        ws.Cell("B2").Style.Font.FontSize = 18;
        ws.Cell("B2").Style.Font.Bold = true;
        ws.Cell("B2").Style.Font.FontColor = Clay900;

        ws.Cell("B3").Value = "KVKK Onam Kayit Defteri - Salt Okunur Hukuki Sicil";
        ws.Range("B3:H3").Merge();
        ws.Cell("B3").Style.Font.FontName = "Calibri";
        ws.Cell("B3").Style.Font.FontSize = 10;
        ws.Cell("B3").Style.Font.FontColor = Clay500;

        var bugun = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, IstanbulTz)
            .ToString("d MMMM yyyy HH:mm", new CultureInfo("tr-TR"));
        ws.Cell("B4").Value = $"Belge uretim ani: {bugun}  -  Toplam kayit: {kayitlar.Count}";
        ws.Range("B4:H4").Merge();
        ws.Cell("B4").Style.Font.FontName = "Calibri";
        ws.Cell("B4").Style.Font.FontSize = 9;
        ws.Cell("B4").Style.Font.Italic = true;
        ws.Cell("B4").Style.Font.FontColor = Clay500;

        // === TABLO BASLIK SATIRI ===
        int hr = 6; // header row
        string[] basliklar = { "#", "Ad Soyad", "E-posta", "Surum", "Pazarlama", "IP", "Tarayici", "Onam Zamani" };
        for (int c = 0; c < basliklar.Length; c++)
        {
            var hucre = ws.Cell(hr, c + 2); // B'den basla
            hucre.Value = basliklar[c];
            hucre.Style.Fill.BackgroundColor = Terracotta;
            hucre.Style.Font.FontColor = CreamLight;
            hucre.Style.Font.Bold = true;
            hucre.Style.Font.FontName = "Calibri";
            hucre.Style.Font.FontSize = 10;
            hucre.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Left;
            hucre.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
        }
        ws.Row(hr).Height = 22;

        // === VERI SATIRLARI ===
        int row = hr + 1;
        int sira = 1;
        foreach (var k in kayitlar)
        {
            ws.Cell(row, 2).Value = sira++;
            ws.Cell(row, 3).Value = k.AdSoyad;
            ws.Cell(row, 4).Value = k.Email;
            ws.Cell(row, 5).Value = $"v{k.Versiyon}";
            ws.Cell(row, 6).Value = k.PazarlamaIzni ? "Verildi" : "-";
            ws.Cell(row, 7).Value = k.Ip ?? "-";
            ws.Cell(row, 8).Value = string.IsNullOrWhiteSpace(k.KullaniciAjan) ? "-" : k.KullaniciAjan;
            ws.Cell(row, 9).Value = TimeZoneInfo.ConvertTime(k.OnamZamani, IstanbulTz)
                .ToString("dd.MM.yyyy HH:mm:ss", new CultureInfo("tr-TR"));

            ws.Cell(row, 2).Style.Font.FontColor = Terracotta;
            ws.Cell(row, 2).Style.Font.Bold = true;
            ws.Cell(row, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            ws.Cell(row, 3).Style.Font.Bold = true;
            ws.Cell(row, 3).Style.Font.FontColor = Clay900;
            ws.Cell(row, 4).Style.Font.FontColor = Clay500;
            ws.Cell(row, 5).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Cell(row, 6).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            ws.Cell(row, 6).Style.Font.FontColor = k.PazarlamaIzni ? Yesil : Clay500;
            ws.Cell(row, 6).Style.Font.Bold = k.PazarlamaIzni;
            ws.Cell(row, 7).Style.Font.FontColor = Clay700;
            ws.Cell(row, 7).Style.Font.FontSize = 9;
            ws.Cell(row, 8).Style.Font.FontColor = Clay500;
            ws.Cell(row, 8).Style.Font.FontSize = 8;
            ws.Cell(row, 8).Style.Alignment.WrapText = false;
            ws.Cell(row, 9).Style.Font.FontColor = Clay700;
            ws.Cell(row, 9).Style.Font.FontSize = 9;

            var satir = ws.Range(row, 2, row, 9);
            satir.Style.Font.FontName = "Calibri";
            satir.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            satir.Style.Border.BottomBorder = XLBorderStyleValues.Thin;
            satir.Style.Border.BottomBorderColor = CreamMedium;
            if ((sira % 2) == 0) satir.Style.Fill.BackgroundColor = CreamLight;

            ws.Row(row).Height = 18;
            row++;
        }

        if (kayitlar.Count == 0)
        {
            ws.Cell(row, 2).Value = "Henuz onam kaydi bulunmuyor.";
            ws.Range(row, 2, row, 9).Merge();
            ws.Cell(row, 2).Style.Font.Italic = true;
            ws.Cell(row, 2).Style.Font.FontColor = Clay500;
            ws.Cell(row, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
        }

        // Kolon genislikleri
        ws.Column("A").Width = 2;
        ws.Column("B").Width = 5;   // #
        ws.Column("C").Width = 26;  // Ad Soyad
        ws.Column("D").Width = 30;  // E-posta
        ws.Column("E").Width = 8;   // Surum
        ws.Column("F").Width = 12;  // Pazarlama
        ws.Column("G").Width = 16;  // IP
        ws.Column("H").Width = 40;  // Tarayici
        ws.Column("I").Width = 20;  // Onam Zamani

        ws.Style.Font.FontName = "Calibri";

        // Baslik satirini dondur (kaydirinca sabit)
        ws.SheetView.FreezeRows(hr);

        // Salt-okunur koruma (parolasiz; sadece gorsel inceleme + filtre + sirala)
        ws.Protect()
            .AllowElement(XLSheetProtectionElements.SelectLockedCells)
            .AllowElement(XLSheetProtectionElements.SelectUnlockedCells)
            .AllowElement(XLSheetProtectionElements.AutoFilter)
            .AllowElement(XLSheetProtectionElements.Sort);

        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }
}

/// <summary>
/// Onam sicili XLSX satiri (endpoint DB projeksiyonundan beslenir).
/// KvkkBelgeTasarimcisi.OnamSatirVeri'den ayri: bu XLSX'e KullaniciAjan da tasir (B4).
/// </summary>
public sealed record KvkkOnamSicilSatiri(
    string AdSoyad, string Email, int Versiyon, bool PazarlamaIzni,
    string? Ip, string? KullaniciAjan, DateTimeOffset OnamZamani);
