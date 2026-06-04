namespace Notlar.Api.Services;

/// <summary>
/// v17 — Sistem runtime placeholder kataloğu (kod içinde sabit, spec Bölüm 3.1).
/// İki tüketici: SistemEndpoints (anahtar validasyonu) + SablonResolver (render çözme).
/// Bu liste yalnız sistemin runtime'da çözebildiği değişkenlerdir; tenant placeholder'ları
/// (başka anahtar referansları) ayrıdır ve metin_anahtarlari içinden gelir.
/// </summary>
public static class SistemPlaceholderlari
{
    public static readonly HashSet<string> Tumu = new()
    {
        "alici_ad", "alici_ad_soyad", "kalan_gun", "kalan_saat", "kalan_dakika",
        "not_basligi", "not_icerik", "klasor_adi", "kullanici_adi", "tarih", "saat", "site_url",
    };
}