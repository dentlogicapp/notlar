using System.Text.RegularExpressions;

namespace Notlar.Api.Services;

/// <summary>
/// v17 - Runtime placeholder cozucu (G.4: minimal iskelet).
/// {{ad}} kaliplari verilen sozlukten doldurulur; taninmayan placeholder oldugu gibi kalir.
/// v17'de sadece sistem placeholder'lari (SistemPlaceholderlari) hedeflenir; isletme_metinleri
/// referansi + ozyineleme v18 Asama 5'te eklenecek. Pure fonksiyon - unit-testlenebilir.
/// </summary>
public interface ISablonResolver
{
    string Coz(string sablon, IReadOnlyDictionary<string, string> degerler);
}

public sealed class SablonResolver : ISablonResolver
{
    // {{ alici_ad }} -> grup(1) = "alici_ad" (snake_case, opsiyonel ic bosluk)
    private static readonly Regex Placeholder =
        new(@"\{\{\s*([a-z0-9_]+)\s*\}\}", RegexOptions.Compiled);

    public string Coz(string sablon, IReadOnlyDictionary<string, string> degerler)
    {
        if (string.IsNullOrEmpty(sablon)) return sablon ?? "";

        return Placeholder.Replace(sablon, m =>
        {
            var ad = m.Groups[1].Value;
            // Sozlukte varsa doldur; yoksa kaliba dokunma (v18'de tenant metni cozecek).
            return degerler.TryGetValue(ad, out var deger) ? deger : m.Value;
        });
    }
}