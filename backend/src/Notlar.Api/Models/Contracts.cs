namespace Notlar.Api.Models;

// Auth
// BeniHatirla null/true → 30 gün persistent cookie; false → session cookie (browser kapanınca silinir)
public sealed record GirisIstegi(string Email, string Sifre, bool? BeniHatirla = null);
public sealed record SifreBelirleIstegi(string Token, string YeniSifre);
public sealed record SifreSifirlaIstegi(string Email);
public sealed record TokenDogrulamaYaniti(string Email, string AdSoyad, string Amac);

// User
// Cinsiyet: "kadin" | "erkek" — zorunlu (Alt-3 davetiye + ileride raporlama için)
public sealed record KullaniciOlusturIstegi(string Email, string AdSoyad, string Rol, string Cinsiyet);
// v19 - uye guncelleme (email DEGISMEZ; ad/soyad/cinsiyet tenant geneline aninda yansir)
public sealed record KullaniciGuncelleIstegi(string AdSoyad, string Cinsiyet);
public sealed record KullaniciYaniti(
    Guid Id, string Email, string AdSoyad, string Rol, bool Aktif,
    string? Cinsiyet,
    bool SifreBelirlendi, bool Kilitli,
    DateTimeOffset OlusturmaZamani, DateTimeOffset? SonGirisZamani,
    // v12 — Silme onayında kullanıcıya gösterilen veriler
    int NotSayisi, int KlasorSayisi);

// v15 — Multi-tenant DTO'ları
public sealed record BenYaniti(
    Guid Id, string Email, string AdSoyad, string Rol, string? Cinsiyet,
    bool SuperAdmin,
    Guid? AktifIsletmeId,
    IReadOnlyList<UyelikYaniti> Uyelikler,
    bool GoruntulemeModu,
    string? GoruntulenenMarka,
    bool SessizSaatAktif,            // v19 4d - sessiz saatler
    string SessizSaatBaslangic,      // "HH:mm"
    string SessizSaatBitis,         // "HH:mm"
    bool KvkkOnamGerekli = false);   // v21 M7 (K6) - gecilemez onam gate tetigi (default'lu: kirilim yok)

public sealed record UyelikYaniti(
    Guid IsletmeId,
    string MarkaAdi,
    string MarkaEmoji,
    string KullanimModu,
    string Rol,            // tenant scope'taki rol ('admin' | 'kullanici')
    bool Aktif);

// v19 P4 - hatirlatma alici secimi icin hafif tenant uye listesi
public sealed record TenantUyeYaniti(
    Guid KullaniciId,
    string AdSoyad,
    string Email);

public sealed record IsletmeYaniti(
    Guid Id,
    string MarkaAdi,
    string MarkaEmoji,
    string IkonSeti,
    string KarsilamaBasligi,
    string KarsilamaAltMetni,
    bool SayacAktif,
    string SayacBasligi,
    DateTime? SayacHedefTarihi,
    string MailImza,
    string MailTonu,
    string KullanimModu);

// v16 — Marka & Görünüm ayar güncelleme
// PATCH semantiği: null gönderilen alan değişmez, dolu gönderilen güncellenir
public sealed record IsletmeAyarGuncelleIstegi(
    string? MarkaAdi,            // maks 80  (DB: isletmeler.MarkaAdi)
    string? MarkaEmoji,          // maks 10
    string? IkonSeti,            // beyaz liste Asama 2'de kilitlenir (bkz. G.3)
    string? KarsilamaBasligi,    // maks 120
    string? KarsilamaAltMetni,   // maks 280
    bool? SayacAktif,
    string? SayacBasligi,        // maks 60
    DateTime? SayacHedefTarihi,  // entity + IsletmeYaniti ile ayni tip
    string? MailImza,            // maks 80
    string? MailTonu);

// Klasor
public sealed record KlasorOlusturIstegi(string Ad, string? Aciklama, string? Ikon, Guid? UstKlasorId);
public sealed record KlasorGuncelleIstegi(string Ad, string? Aciklama, string? Ikon);
public sealed record KlasorYaniti(
    Guid Id, string Ad, string? Aciklama, string Ikon,
    Guid? UstKlasorId, string OlusturanAdSoyad,
    DateTimeOffset OlusturmaZamani, int NotSayisi, int AltKlasorSayisi,
    bool SistemMi,
    // Kilit (null = açık, dolu = kim düzenliyor)
    string? KilitSahibiAdi);

// Klasör içerik özeti — silme onayı öncesi kullanıcıya gösterilir
public sealed record KlasorIcerikOzetYaniti(
    Guid Id, string Ad,
    int BekleyenNot, int TamamlananNot, int SilinmisNot, int ToplamNot);

// Not — hatırlatma alanları opsiyonel (toggle kapalıysa null gelir)
public sealed record NotOlusturIstegi(
    string Baslik, string? Icerik, Guid? KlasorId,
    DateTimeOffset? HatirlatmaZamani = null,
    string? HatirlatmaKime = null,         // DEPRECATED v19 P4 (eski 2-kullanicili model)
    string? HatirlatmaSekli = null,        // "uygulama" | "email" | "her_ikisi"
    List<Guid>? HatirlatmaAliciIdler = null, // v19 P4 - secili uye id'leri (cok alici)
    string? HatirlatmaTekrar = null,          // v21 M8
    DateTimeOffset? HatirlatmaTekrarBitis = null,  // v21 M8
    int? HatirlatmaErkenDakika = null         // v21 M8
);

public sealed record NotGuncelleIstegi(
    string Baslik, string? Icerik, Guid? KlasorId, string? DegisiklikAciklamasi,
    DateTimeOffset? HatirlatmaZamani = null,
    string? HatirlatmaKime = null,
    string? HatirlatmaSekli = null,
    bool HatirlatmaSil = false,             // toggle kapatıldıysa hatırlatmayı sil
    List<Guid>? HatirlatmaAliciIdler = null, // v19 P4 - secili uye id'leri
    string? HatirlatmaTekrar = null,          // v21 M8
    DateTimeOffset? HatirlatmaTekrarBitis = null,  // v21 M8
    int? HatirlatmaErkenDakika = null         // v21 M8
);

public sealed record NotTamamlaIstegi(string TamamlanmaAciklamasi);

public sealed record NotYaniti(
    Guid Id, string Baslik, string? Icerik, bool Tamamlandi,
    string? TamamlanmaAciklamasi, DateTimeOffset? TamamlanmaZamani,
    string? TamamlayanAdSoyad,
    Guid? KlasorId, string? KlasorAdi,
    Guid OlusturanId, string OlusturanAdSoyad,
    DateTimeOffset OlusturmaZamani, DateTimeOffset GuncellemeZamani,
    bool Silindi, DateTimeOffset? SilinmeZamani,
    // Hatırlatma (kurulmamışsa null)
    DateTimeOffset? HatirlatmaZamani,
    string? HatirlatmaKime,
    List<Guid>? HatirlatmaAliciIdler,
    string? HatirlatmaSekli,
    bool HatirlatmaGonderildiMi,
    string? HatirlatmaTekrar,              // v21 M8
    DateTimeOffset? HatirlatmaTekrarBitis, // v21 M8
    int? HatirlatmaErkenDakika,            // v21 M8
    // Kilit
    string? KilitSahibiAdi,
    Guid? EskiKlasorId,
    // v19 - read receipts: avatar yigini + yeni/degisen tespiti (BenimSonGorme < GuncellemeZamani -> degismis)
    int OkuyanSayisi,
    IReadOnlyList<NotOkuyanYaniti> Okuyanlar,
    DateTimeOffset? BenimSonGorme,
    bool BasaTutuldu = false);  // v21 M4 - default'lu: mevcut cagri noktalari kirilmaz

// v19 - not okuyan ozeti (avatar yigini icin)
public sealed record NotOkuyanYaniti(Guid KullaniciId, string AdSoyad, DateTimeOffset OkunmaZamani);

public sealed record NotGecmisiYaniti(
    Guid Id, string Eylem, string? Aciklama,
    string? EskiDeger, string? YeniDeger,
    string YapanAdSoyad, DateTimeOffset YapilisZamani);

// Bildirim
public sealed record BildirimYaniti(
    Guid Id, string Tip, Guid? NotId,
    string Baslik, string Mesaj,
    bool OkunduMu, DateTimeOffset? OkumaZamani,
    DateTimeOffset OlusturmaZamani);

public sealed record BildirimOzetiYaniti(int OkunmamisSayisi, IReadOnlyList<BildirimYaniti> Bildirimler);

// Denetim
public sealed record DenetimYaniti(
    Guid Id, string Olay, string? HedefTip, Guid? HedefId,
    Guid? AktorKullaniciId, string? AktorEmail,
    string? Ip, string? Detay,
    string? DegisenAlanlar,
    DateTimeOffset Zaman);

// Kilit (edit lock) yanıtı
public sealed record KilitYaniti(bool BasariliMi, string? KilitSahibiAdi);

// v17 — Sistem metin anahtarlari (super admin)
public sealed record MetinAnahtariIstegi(
    string Anahtar,                       // lowercase snake_case, maks 80
    string Etiket,                        // 1-120
    string Yonlendirme,                   // 1-500 (input placeholder)
    string? Aciklama,                     // 0-1000 (form alti help)
    string Tip,                           // subject|body|baslik|metin|placeholder_kisa
    bool? Zorunlu,                        // default false
    List<string>? DesteklenenPlaceholderlar,  // JSONB <-> List (endpoint serialize)
    int? Sira,                            // default 100
    string Kategori,                      // mail|dashboard|sayac|bildirim|form|marka
    int? KarakterLimiti = null);          // v18 Asama 11.8 - null = tipten gelen default

public sealed record MetinAnahtariYaniti(
    Guid Id, string Anahtar, string Etiket, string Yonlendirme, string Aciklama,
    string Tip, bool Zorunlu, List<string> DesteklenenPlaceholderlar,
    int Sira, string Kategori, int? KarakterLimiti, bool Deprecated,
    DateTimeOffset OlusturmaZamani, DateTimeOffset GuncellemeZamani);

// v17 - AI saglayici ayar (super admin)
public sealed record AiAyariGuncelleIstegi(
    string Saglayici,        // openai | anthropic | lokal
    string ModelId,          // saglayiciya ozgu model adi
    string? ApiKey,          // raw; bos ise mevcut korunur (key rotation)
    string? BaseUrl,         // lokal saglayici icin zorunlu
    int? TimeoutMs,          // default 30000
    bool? Aktif);            // AI acik/kapali

public sealed record AiAyariYaniti(
    string Saglayici, string ModelId, string? ApiKeyMaskeli, string? BaseUrl,
    int TimeoutMs, bool Aktif, DateTimeOffset? SonSaglikKontrol, bool? SonSaglikDurum);

// v18 - tenant metin endpoint DTO'lari
public sealed record MetinKaydetIstegi(string Icerik);

public sealed record MetinBirlesik(
    string Anahtar, string Etiket, string Yonlendirme, string Aciklama,
    string Tip, string Kategori, bool Zorunlu, int Sira,
    IReadOnlyList<string> Placeholderlar, string? Icerik, int? KarakterLimiti = null, bool Deprecated = false, string Kapsam = "Tenant", string? Varsayilan = null);

public sealed record MetinVersiyonYaniti(Guid Id, int Versiyon, string Icerik, DateTimeOffset OlusturmaZamani);

public sealed record OnboardingDurum(int Toplam, int Dolu, IReadOnlyList<string> EksikAnahtarlar);

// v18 Asama 17-E - wizard sonu welcome/davetiye onizleme test maili
public sealed record OnboardingTestMailIstegi(string Email, string? Ad = null);

// v18 Asama 17.3 - app push cihaz kaydi
public sealed record CihazKayitIstegi(string PushToken, string Platform, string? CihazAdi = null, string? P256dh = null, string? Auth = null);
public sealed record CihazYaniti(Guid Id, string Platform, string? CihazAdi, string TokenSon,
    DateTimeOffset OlusturmaZamani, DateTimeOffset SonAktiflik);

// v18 Asama 19 B2 - tur analytics
public sealed record TurAuditIstegi(string Eylem, int AdimNo, int? KalanSureSn = null);

// v19 4d - kendi profil guncelleme (ad soyad + cinsiyet; email degistirilemez)
public sealed record ProfilGuncelleIstegi(string AdSoyad, string? Cinsiyet);

// v19 4d - kendi sessiz saat ayarlari (Baslangic/Bitis "HH:mm")
public sealed record SessizSaatGuncelleIstegi(bool Aktif, string Baslangic, string Bitis);

public sealed record BildirimTestIstegi(string Olay);
