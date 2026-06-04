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
    IReadOnlyList<string>? DigerMetinler);    // tutarlilik baglami (dolu diger metinler)

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