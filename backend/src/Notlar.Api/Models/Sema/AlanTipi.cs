namespace Notlar.Api.Models.Sema;

// v18 Asama 11.9 - Schema-as-Code: anahtar alan tipleri (compile-time guvenlik).
// DB karsiligi (metin_anahtarlari.Tip) lowercase snake_case; eslestirme TipDefault.Kod ile.
public enum AlanTipi
{
    Subject,           // tek satir mail konusu - 50 char default
    Body,              // multiline govde - 5000 char default, richtext OK
    Baslik,            // tek satir baslik - 60 char default
    Metin,             // kisa metin - 200 char default
    PlaceholderKisa,   // kisa placeholder/deger - 80 char default
}
