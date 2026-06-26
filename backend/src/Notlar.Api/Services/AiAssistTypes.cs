namespace Notlar.Api.Services;

/// <summary>
/// v17 - AI taslak onerisi icin tenant baglami (prompt'a aktarilir).
/// </summary>
public sealed record AiTaslakBaglam(
    string Etiket,                            // anahtarin UI etiketi
    string? Aciklama,                         // form alti help
    IReadOnlyList<string> Placeholderlar,     // desteklenen runtime placeholder'lar
    string MarkaAdi,                          // tenant marka adi
    string? EtkinlikTanimi,                   // etkinlik/is tipi (dugun, klinik, ekip vb.)
    string Ton,                               // 'samimi' | 'resmi' | ...
    string? Uzunluk,                          // istenen uzunluk ipucu (kisa/orta/uzun)
    IReadOnlyList<string>? DigerMetinler,     // tutarlilik baglami (dolu diger metinler)
    string? Mod = null,                       // v18 Asama 11.6 - null/"tenant" | "dokumantasyon"
    string? Tip = null,                       // dokumantasyon: anahtar tipi (subject/baslik/metin/body/placeholder_kisa)
    string? Kategori = null,                  // dokumantasyon: anahtar kategorisi
    string? HedefAlan = null);                // dokumantasyon: "yonlendirme" | "aciklama"

/// <summary>
/// v17 - Yeniden yazma modu. Deger lowercase_snake: prompt + JSON request ile dogal eslesir.
/// </summary>
public enum AiYenidenYazModu
{
    daha_samimi,
    daha_resmi,
    daha_kisa,
    daha_uzun,
    daha_eglenceli
}

/// <summary>
/// v17 - AI taslak/yeniden-yaz sonucu (oneriler + telemetri).
/// G.3: ModelId interface property degil; sonuc icinde doner.
/// </summary>
public sealed record TaslakSonucu(
    IReadOnlyList<string> Oneriler,
    string SaglayiciAdi,
    string ModelId,
    long YanitSuresiMs);

/// <summary>
/// v17 - Tutarlilik kontrol raporu (tek tenant'in sistem metinleri).
/// </summary>
public sealed record AiTutarlilikRaporu(
    double Skor,
    bool Tutarli,
    IReadOnlyList<AiTutarsizlik> Sorunlar);

public sealed record AiTutarsizlik(
    string Anahtar,
    string Mevcut,
    string Sorun,
    string Oneri);

/// <summary>
/// v17 - AI cagrisi yapilamadiginda firlatilir. Kod = TURKCE_KAPITAL hata kodu (spec 6.7).
/// Endpoint'ler (v18) bunu yakalayip { hata, mesaj } shape'ine cevirir.
/// </summary>
public sealed class AiKullanilamazException : Exception
{
    public string Kod { get; }

    public AiKullanilamazException(string kod, string? mesaj = null)
        : base(mesaj ?? kod) => Kod = kod;
}

/// <summary>
/// v19 - Serbest prompt ile mail metni uretimi baglami (Inline AI Compose).
/// Sadece super admin, mail field'larinda (kategori=mail) kullanilir. Cikti DUZ METIN (JSON degil)
/// - streaming (B1) ile token token akar, tek oneri olarak diff onizlemeye (B3) gider.
/// Etiket/Yonlendirme/Tip = baglam farkindaligi (B2): AI alanin ne oldugunu bilir.
/// </summary>
public sealed record SerbestUretBaglam(
    string Prompt,            // kullanicinin serbest istegi
    string Anahtar,           // mail metin anahtari (orn. mail_davetiye_konu)
    string Etiket,            // anahtarin UI etiketi (B2 baglam)
    string? Yonlendirme,      // anahtarin ipucu/placeholder (B2 baglam)
    string Tip,               // 'subject' | 'body' (karakter limiti icin)
    string MarkaAdi,          // tenant marka adi
    string? MevcutMetin,      // field'in mevcut degeri (varsa: gelistir/degistir)
    string? Ton,              // ton ipucu (B5 chip): null | samimi | resmi | ...
    string? Uzunluk);         // uzunluk ipucu (B5 chip): null | kisa | orta | uzun