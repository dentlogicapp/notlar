namespace Notlar.Api.Models.Sema;

// v18 Asama 11.9 - tip basina varsayilan karakter limiti + enum/DB string eslestirme.
// KarakterSayaci ve sync servisi buradan beslenir (tek dogruluk).
public static class TipDefault
{
    public static int KarakterLimiti(AlanTipi tip) => tip switch
    {
        AlanTipi.Subject         => 50,
        AlanTipi.Baslik          => 60,
        AlanTipi.Metin           => 200,
        AlanTipi.Body            => 5000,
        AlanTipi.PlaceholderKisa => 80,
        _                        => 200,
    };

    // DB string tip kodundan limit (sema endpoint efektif limit hesabi)
    public static int KarakterLimiti(string tipKodu) => tipKodu switch
    {
        "subject"          => 50,
        "baslik"           => 60,
        "metin"            => 200,
        "body"             => 5000,
        "placeholder_kisa" => 80,
        _                  => 200,
    };

    // enum -> DB string (metin_anahtarlari.Tip)
    public static string Kod(AlanTipi tip) => tip switch
    {
        AlanTipi.Subject         => "subject",
        AlanTipi.Body            => "body",
        AlanTipi.Baslik          => "baslik",
        AlanTipi.Metin           => "metin",
        AlanTipi.PlaceholderKisa => "placeholder_kisa",
        _                        => "metin",
    };

    // enum -> DB string (metin_anahtarlari.Kategori)
    public static string Kod(Kategori kategori) => kategori switch
    {
        Kategori.Marka     => "marka",
        Kategori.Dashboard => "dashboard",
        Kategori.Sayac     => "sayac",
        Kategori.Mail      => "mail",
        Kategori.Bildirim  => "bildirim",
        Kategori.Form      => "form",
        _                  => "form",
    };
}
