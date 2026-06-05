using System.Net;
using System.Text.RegularExpressions;

namespace Notlar.Api.Services;

/// <summary>
/// v18 - Tam runtime placeholder cozucu (Sifir Sablon KATMAN 3, spec 3.2).
/// Tek birlesik sozluk (sistem placeholder'lari + tenant metinleri) uzerinde ozyinelemeli cozer:
/// bir degerin icinde baska {{anahtar}} varsa o da cozulur (maks 5 seviye, sonsuz dongu korumasi).
/// Cozulemeyen placeholder kalibi korunur. htmlEncode=true ise degerler HTML-escape edilir (mail/HTML).
/// </summary>
public interface ISablonResolver
{
    string Coz(string sablon, IReadOnlyDictionary<string, string> degerler, bool htmlEncode = false);

    // Linter (spec 3.3): sablondaki, sozlukte karsiligi olmayan placeholder adlari (UI uyarisi icin).
    IReadOnlyList<string> TanimsizlariBul(string sablon, IReadOnlyDictionary<string, string> degerler);
}

public sealed class SablonResolver : ISablonResolver
{
    private const int MaksDerinlik = 5;   // spec 3.2: ozyineleme limiti

    // {{ alici_ad }} -> grup(1) = "alici_ad" (snake_case, opsiyonel ic bosluk)
    private static readonly Regex Placeholder =
        new(@"\{\{\s*([a-z0-9_]+)\s*\}\}", RegexOptions.Compiled);

    public string Coz(string sablon, IReadOnlyDictionary<string, string> degerler, bool htmlEncode = false)
        => CozIc(sablon ?? "", degerler, htmlEncode, 0);

    private string CozIc(string sablon, IReadOnlyDictionary<string, string> degerler, bool htmlEncode, int derinlik)
    {
        if (string.IsNullOrEmpty(sablon) || derinlik >= MaksDerinlik) return sablon ?? "";

        return Placeholder.Replace(sablon, m =>
        {
            var ad = m.Groups[1].Value;
            if (!degerler.TryGetValue(ad, out var deger))
                return m.Value;   // cozulemedi -> kalibi koru (v19'da varsayilan eklenebilir)

            var cikti = htmlEncode ? WebUtility.HtmlEncode(deger) : deger;

            // Ozyineleme: deger baska placeholder iceriyorsa onu da coz (derinlik korumali)
            return Placeholder.IsMatch(cikti) ? CozIc(cikti, degerler, htmlEncode, derinlik + 1) : cikti;
        });
    }

    public IReadOnlyList<string> TanimsizlariBul(string sablon, IReadOnlyDictionary<string, string> degerler)
    {
        if (string.IsNullOrEmpty(sablon)) return Array.Empty<string>();
        return Placeholder.Matches(sablon)
            .Select(m => m.Groups[1].Value)
            .Where(ad => !degerler.ContainsKey(ad))
            .Distinct()
            .ToList();
    }
}