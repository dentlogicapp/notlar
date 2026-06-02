using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using HtmlToOpenXml;

namespace Notlar.Api.Services;

/// <summary>
/// v14 — HTML → DOCX dönüşümü.
/// HtmlToOpenXml kütüphanesi ile davetiye-stilinde HTML'i Word formatına çevirir.
/// Google Fonts → Word fallback (Georgia / Calibri), inline stiller korunur.
///
/// Not: HtmlToOpenXml her CSS kuralını desteklemez. SVG dekoratif öğeler
/// (kalp, asma) DOCX'te kaybolur. Layout sade ama brand renkleri ve tipografi korunur.
/// Bu PDF kadar görsel zengin değildir, ama Word'de açılıp düzenlenebilirlik için yeterli.
/// </summary>
public interface IDocxDonusturucu
{
    Task<byte[]> HtmlDocxeAsync(string html, CancellationToken ct = default);
}

public sealed class DocxDonusturucu : IDocxDonusturucu
{
    public async Task<byte[]> HtmlDocxeAsync(string html, CancellationToken ct = default)
    {
        using var ms = new MemoryStream();
        using (var doc = WordprocessingDocument.Create(ms, WordprocessingDocumentType.Document))
        {
            var main = doc.AddMainDocumentPart();
            main.Document = new Document(new Body());

            // Sayfa kenar boşlukları + A4 boyutu
            var sectionProps = new SectionProperties(
                new PageSize { Width = 11906, Height = 16838 }, // A4 twentieths-of-a-point
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
            main.Document.Body!.AppendChild(sectionProps);

            // HTML → DOCX dönüşümü
            var converter = new HtmlConverter(main);
            // CSS class'ları desteklemediği için inline style önemli — HtmlTasarimcisi inline'ı da
            // dahil olarak vermiyor ama HtmlConverter <style> bloğunu otomatik parse eder.
            await converter.ParseHtml(html);

            main.Document.Save();
        }
        return ms.ToArray();
    }
}
