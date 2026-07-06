using ClosedXML.Excel;

namespace Notlar.Api.Services;

/// <summary>
/// v21 M7 (2A) - XLSX dunyasinin TEK renk kaynagi (davetiye paleti).
/// Onceden XlsxTasarimcisi icinde private tanimliydi; KVKK onam sicili XLSX'i de
/// ayni paletten beslenmesi icin ortak sinifa cikarildi (Bolum 3: paralel yapi yok).
/// Kapsam SADECE XLColor (ClosedXML). Docx (OpenXML hex) ve Html/Kvkk (CSS hex)
/// ayri format-dunyalari; onlar bilerek bu palete bagli DEGIL.
/// ARGB degerleri HtmlTasarimcisi CSS paletiyle ozdes (gorsel tutarlilik).
/// </summary>
public static class XlsxPaleti
{
    public static readonly XLColor Terracotta = XLColor.FromArgb(196, 112, 77);
    public static readonly XLColor TerracottaDark = XLColor.FromArgb(168, 90, 62);
    public static readonly XLColor CreamLight = XLColor.FromArgb(253, 250, 244);
    public static readonly XLColor CreamMedium = XLColor.FromArgb(243, 235, 218);
    public static readonly XLColor Clay900 = XLColor.FromArgb(42, 27, 15);
    public static readonly XLColor Clay700 = XLColor.FromArgb(78, 55, 34);
    public static readonly XLColor Clay500 = XLColor.FromArgb(138, 101, 65);
    public static readonly XLColor Amber50 = XLColor.FromArgb(255, 251, 235);
    public static readonly XLColor Yesil = XLColor.FromArgb(77, 110, 47);
}
