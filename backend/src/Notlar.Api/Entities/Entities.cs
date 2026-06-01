namespace Notlar.Api.Entities;

/// <summary>
/// Kullanıcı. Şifre hash'li (BCrypt), 5 deneme kilit politikası.
/// </summary>
public sealed class Kullanici
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Email { get; set; }
    public required string AdSoyad { get; set; }
    public string? SifreHash { get; set; }  // İlk oluşturulduğunda null, kullanıcı belirledikten sonra dolar
    public required string Rol { get; set; } = "kullanici";
    public bool Aktif { get; set; } = true;

    // Cinsiyet: "kadin" | "erkek"  (zorunlu, mail tonu + ileride raporlama için)
    public string? Cinsiyet { get; set; }

    // Lockout
    public int BasarisizDeneme { get; set; }
    public DateTimeOffset? KilitlenmeZamani { get; set; }

    public DateTimeOffset OlusturmaZamani { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? SonGirisZamani { get; set; }
    public DateTimeOffset? SifreBelirlenmeZamani { get; set; }

    public ICollection<AuthToken> Tokenler { get; set; } = new List<AuthToken>();
    public ICollection<Klasor> OlusturduguKlasorler { get; set; } = new List<Klasor>();
    public ICollection<Not> OlusturduguNotlar { get; set; } = new List<Not>();
    public ICollection<Bildirim> Bildirimler { get; set; } = new List<Bildirim>();
}

/// <summary>
/// İki amaçlı: "setup" (ilk şifre belirleme) ve "reset" (şifre sıfırlama).
/// </summary>
public sealed class AuthToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid KullaniciId { get; set; }
    public required string Token { get; set; }
    public required string Amac { get; set; }  // "setup" | "reset"
    public DateTimeOffset GecerlilikSonu { get; set; }
    public bool Kullanildi { get; set; }
    public DateTimeOffset OlusturmaZamani { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? KullanildiZamani { get; set; }

    public Kullanici Kullanici { get; set; } = null!;
}

/// <summary>
/// 2 seviye klasör. UstKlasorId null = kök seviye.
/// </summary>
public sealed class Klasor
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Ad { get; set; }
    public string? Aciklama { get; set; }
    public string Ikon { get; set; } = "klasor";  // lucide icon ismi
    public Guid? UstKlasorId { get; set; }
    public Klasor? UstKlasor { get; set; }
    public ICollection<Klasor> AltKlasorler { get; set; } = new List<Klasor>();

    public Guid OlusturanKullaniciId { get; set; }
    public Kullanici OlusturanKullanici { get; set; } = null!;
    public DateTimeOffset OlusturmaZamani { get; set; } = DateTimeOffset.UtcNow;

    public bool Silindi { get; set; }
    public DateTimeOffset? SilinmeZamani { get; set; }

    public ICollection<Not> Notlar { get; set; } = new List<Not>();
}

public sealed class Not
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Baslik { get; set; }
    public string? Icerik { get; set; }
    public bool Tamamlandi { get; set; }
    public string? TamamlanmaAciklamasi { get; set; }
    public DateTimeOffset? TamamlanmaZamani { get; set; }
    public Guid? TamamlayanKullaniciId { get; set; }
    public Kullanici? TamamlayanKullanici { get; set; }

    public Guid? KlasorId { get; set; }
    public Klasor? Klasor { get; set; }

    public Guid OlusturanKullaniciId { get; set; }
    public Kullanici OlusturanKullanici { get; set; } = null!;
    public DateTimeOffset OlusturmaZamani { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset GuncellemeZamani { get; set; } = DateTimeOffset.UtcNow;

    // Hatırlatıcı — tek hatırlatma per not (sade). Tümü NULL = hatırlatıcı yok.
    public DateTimeOffset? HatirlatmaZamani { get; set; }
    public string? HatirlatmaKime { get; set; }                 // "askima" | "bana" | "ikimize"
    public string? HatirlatmaSekli { get; set; }                // "uygulama" | "email" | "her_ikisi"
    public bool HatirlatmaGonderildiMi { get; set; }            // background service idempotent için
    public DateTimeOffset? HatirlatmaGonderimZamani { get; set; }
    public Guid? HatirlatmaKuranKullaniciId { get; set; }       // imza/audit için

    // Soft delete
    public bool Silindi { get; set; }
    public DateTimeOffset? SilinmeZamani { get; set; }
    public Guid? SilenKullaniciId { get; set; }

    public ICollection<NotGecmisi> Gecmis { get; set; } = new List<NotGecmisi>();
}

public sealed class NotGecmisi
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid NotId { get; set; }
    public Not Not { get; set; } = null!;

    public required string Eylem { get; set; }  // "olusturuldu" | "duzenlendi" | "tamamlandi" | "yeniden_acildi" | "tasindi" | "silindi" | "geri_alindi"
    public string? EskiDeger { get; set; }     // JSON snapshot
    public string? YeniDeger { get; set; }
    public string? Aciklama { get; set; }       // Kullanıcının yazdığı opsiyonel/zorunlu not

    public Guid YapanKullaniciId { get; set; }
    public Kullanici YapanKullanici { get; set; } = null!;
    public DateTimeOffset YapilisZamani { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Sistem geneli denetim kaydı (OmniAsistan Dok 04 pattern).
/// Notlar dışındaki değişiklikler de buraya: login, şifre reset, kullanıcı oluşturma vb.
/// </summary>
public sealed class DenetimGunlugu
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Olay { get; set; }    // "giris_basarili", "giris_basarisiz", "sifre_reset_istegi", "kullanici_olusturuldu" vs.
    public string? HedefTip { get; set; }         // "kullanici", "klasor", "not" vb.
    public Guid? HedefId { get; set; }
    public Guid? AktorKullaniciId { get; set; }
    public string? AktorEmail { get; set; }        // Login fail'de henüz kullanıcı id yok, email yazılır
    public string? Ip { get; set; }
    public string? KullaniciAjan { get; set; }
    public string? DegisenAlanlar { get; set; }    // JSONB
    public string? Detay { get; set; }              // Ekstra not
    public DateTimeOffset Zaman { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Kullanıcı bildirimleri — Instagram-vari feed.
/// Şimdilik tek tip: "hatirlatma". İleride genişleyebilir.
/// </summary>
public sealed class Bildirim
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid KullaniciId { get; set; }
    public Kullanici Kullanici { get; set; } = null!;

    public required string Tip { get; set; }       // "hatirlatma" (şimdilik tek değer)
    public Guid? NotId { get; set; }                // hatırlatma için ilgili not (opsiyonel)
    public required string Baslik { get; set; }    // "Hatırlatıcı"
    public required string Mesaj { get; set; }     // "\"Davetiye sipariş et\" notunun zamanı geldi"

    public bool OkunduMu { get; set; }
    public DateTimeOffset? OkumaZamani { get; set; }
    public DateTimeOffset OlusturmaZamani { get; set; } = DateTimeOffset.UtcNow;
}
