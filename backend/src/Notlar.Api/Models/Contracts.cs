namespace Notlar.Api.Models;

// Auth
// BeniHatirla null/true → 30 gün persistent cookie; false → session cookie (browser kapanınca silinir)
public sealed record GirisIstegi(string Email, string Sifre, bool? BeniHatirla = null);
public sealed record SifreBelirleIstegi(string Token, string YeniSifre);
public sealed record SifreSifirlaIstegi(string Email);
public sealed record TokenDogrulamaYaniti(string Email, string AdSoyad, string Amac);

// User
public sealed record KullaniciOlusturIstegi(string Email, string AdSoyad, string Rol);
public sealed record KullaniciYaniti(
    Guid Id, string Email, string AdSoyad, string Rol, bool Aktif,
    bool SifreBelirlendi, bool Kilitli,
    DateTimeOffset OlusturmaZamani, DateTimeOffset? SonGirisZamani);

public sealed record BenYaniti(Guid Id, string Email, string AdSoyad, string Rol);

// Klasor
public sealed record KlasorOlusturIstegi(string Ad, string? Aciklama, string? Ikon, Guid? UstKlasorId);
public sealed record KlasorGuncelleIstegi(string Ad, string? Aciklama, string? Ikon);
public sealed record KlasorYaniti(
    Guid Id, string Ad, string? Aciklama, string Ikon,
    Guid? UstKlasorId, string OlusturanAdSoyad,
    DateTimeOffset OlusturmaZamani, int NotSayisi, int AltKlasorSayisi);

// Klasör içerik özeti — silme onayı öncesi kullanıcıya gösterilir
public sealed record KlasorIcerikOzetYaniti(
    Guid Id, string Ad,
    int BekleyenNot, int TamamlananNot, int SilinmisNot, int ToplamNot);

// Not
public sealed record NotOlusturIstegi(string Baslik, string? Icerik, Guid? KlasorId);
public sealed record NotGuncelleIstegi(string Baslik, string? Icerik, Guid? KlasorId, string? DegisiklikAciklamasi);
public sealed record NotTamamlaIstegi(string TamamlanmaAciklamasi);
public sealed record NotYaniti(
    Guid Id, string Baslik, string? Icerik, bool Tamamlandi,
    string? TamamlanmaAciklamasi, DateTimeOffset? TamamlanmaZamani,
    string? TamamlayanAdSoyad,
    Guid? KlasorId, string? KlasorAdi,
    Guid OlusturanId, string OlusturanAdSoyad,
    DateTimeOffset OlusturmaZamani, DateTimeOffset GuncellemeZamani,
    bool Silindi, DateTimeOffset? SilinmeZamani);

public sealed record NotGecmisiYaniti(
    Guid Id, string Eylem, string? Aciklama,
    string? EskiDeger, string? YeniDeger,
    string YapanAdSoyad, DateTimeOffset YapilisZamani);

// Denetim
public sealed record DenetimYaniti(
    Guid Id, string Olay, string? HedefTip, Guid? HedefId,
    Guid? AktorKullaniciId, string? AktorEmail,
    string? Ip, string? Detay,
    string? DegisenAlanlar,
    DateTimeOffset Zaman);
