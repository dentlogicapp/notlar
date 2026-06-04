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
    public required string Rol { get; set; } = "kullanici";  // v15: DEPRECATED — yerine IsletmeUyelik.Rol, geriye uyumluluk için tutulur
    public bool Aktif { get; set; } = true;

    // Cinsiyet: "kadin" | "erkek"  (zorunlu, mail tonu + ileride raporlama için)
    public string? Cinsiyet { get; set; }

    // v15 — Multi-tenant kararları
    public bool SuperAdmin { get; set; }                  // Sistem geneli yetki (tenant-bağımsız)
    public Guid? AktifIsletmeId { get; set; }             // Şu an hangi tenant'ta çalışıyor (multi-tenant geçişler için)

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
    public ICollection<IsletmeUyelik> Uyelikler { get; set; } = new List<IsletmeUyelik>();
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
    public Guid IsletmeId { get; set; }  // v15 — Tenant scope
    public string? Aciklama { get; set; }
    public string Ikon { get; set; } = "klasor";  // lucide icon ismi

    // Sistem klasörü mü? (Tamamlananlar gibi — silinemez, düzenlenemez)
    public bool SistemMi { get; set; }

    // Yumuşak kilit (edit lock) — null = açık
    public Guid? KilitKullaniciId { get; set; }
    public DateTimeOffset? KilitZamani { get; set; }

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
    public Guid IsletmeId { get; set; }  // v15 — Tenant scope
    public required string Baslik { get; set; }
    public string? Icerik { get; set; }
    public bool Tamamlandi { get; set; }
    public string? TamamlanmaAciklamasi { get; set; }
    public DateTimeOffset? TamamlanmaZamani { get; set; }
    public Guid? TamamlayanKullaniciId { get; set; }
    public Kullanici? TamamlayanKullanici { get; set; }

    public Guid? KlasorId { get; set; }
    public Klasor? Klasor { get; set; }

    // Tamamlandığında eski klasör hatırlanır → yeniden açılırsa geri taşınır
    public Guid? EskiKlasorId { get; set; }

    // Yumuşak kilit (edit lock) — null = açık
    public Guid? KilitKullaniciId { get; set; }
    public DateTimeOffset? KilitZamani { get; set; }

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
    public Guid IsletmeId { get; set; }  // v15 — Tenant scope
    public Guid NotId { get; set; }
    public Not Not { get; set; } = null!;

    public required string Eylem { get; set; }  // "olusturuldu" | "duzenlendi" | "tamamlandi" | "yeniden_acildi" | "tasindi" | "silindi" | "geri_alindi"
    public string? EskiDeger { get; set; }     // JSON snapshot
    public string? YeniDeger { get; set; }
    public string? Aciklama { get; set; }       // Kullanıcının yazdığı opsiyonel/zorunlu not

    // v11 — Kullanıcı silindiğinde audit kaydı kalır, YapanKullaniciId null olur (anonim audit)
    public Guid? YapanKullaniciId { get; set; }
    public Kullanici? YapanKullanici { get; set; }
    public DateTimeOffset YapilisZamani { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// Sistem geneli denetim kaydı (OmniAsistan Dok 04 pattern).
/// Notlar dışındaki değişiklikler de buraya: login, şifre reset, kullanıcı oluşturma vb.
/// </summary>
public sealed class DenetimGunlugu
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? IsletmeId { get; set; }  // v15 — Tenant scope (null = sistem geneli/super admin olayı)
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
    public Guid IsletmeId { get; set; }  // v15 — Tenant scope
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

/// <summary>
/// v15 — İşletme/Tenant: her marka ayrı bir kayıt.
/// Marka & Görünüm ayarları doğrudan bu tabloda (v16'da detaylı UI gelecek).
/// </summary>
public sealed class Isletme
{
    public Guid Id { get; set; } = Guid.NewGuid();

    // Marka
    public string MarkaAdi { get; set; } = "Planlama Defterimiz";
    public string MarkaEmoji { get; set; } = "🤍";
    public string IkonSeti { get; set; } = "kalp";          // 'kalp'|'klasik'|'ekip'|'aile'|'tatil'

    // Karşılama
    public string KarsilamaBasligi { get; set; } = "Merhaba Aşkım";
    public string KarsilamaAltMetni { get; set; } = "Bugün aklına gelen bir şeyi birlikte planlayıp tamamlamak için not etmek ister misin?";

    // Sayaç
    public bool SayacAktif { get; set; } = true;
    public string SayacBasligi { get; set; } = "kavuşmamıza son";
    public DateTime? SayacHedefTarihi { get; set; }

    // Mail
    public string MailImza { get; set; } = "Sevgilerle";
    public string MailTonu { get; set; } = "samimi";        // 'samimi'|'profesyonel'

    // Mod
    public string KullanimModu { get; set; } = "es";        // 'es'|'aile'|'ekip'|'tatil'|'ozel'

    // Tenant meta
    public DateTimeOffset OlusturmaZamani { get; set; } = DateTimeOffset.UtcNow;
    public Guid? OlusturanSuperAdminId { get; set; }        // null = ilk seed tenant'ı (Planlama Defterimiz)
    public bool Aktif { get; set; } = true;
    public bool Silindi { get; set; }

    // Navigasyon
    public ICollection<IsletmeUyelik> Uyelikler { get; set; } = new List<IsletmeUyelik>();
}

/// <summary>
/// v15 — Kullanıcı ↔ İşletme join. Aynı kullanıcı birden fazla tenant'a farklı rollerle üye olabilir.
/// </summary>
public sealed class IsletmeUyelik
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid IsletmeId { get; set; }
    public Isletme Isletme { get; set; } = null!;

    public Guid KullaniciId { get; set; }
    public Kullanici Kullanici { get; set; } = null!;

    public string Rol { get; set; } = "kullanici";          // 'admin' | 'kullanici'
    public DateTimeOffset KatilmaZamani { get; set; } = DateTimeOffset.UtcNow;
    public bool Aktif { get; set; } = true;                 // Pasifleştirme bu seviyede (tenant scope)
}
/// <summary>
/// v17 — Sistem metin anahtar kataloğu (sıfır şablon mimarisi).
/// Süper admin tanımlar; tenant içeriği isletme_metinleri tablosunda doldurur (v18).
/// </summary>
public sealed class MetinAnahtari
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Anahtar { get; set; }            // Sistem kodu içinde sabit (örn. mail_davetiye_konu)
    public required string Etiket { get; set; }             // UI form başlığı
    public required string Yonlendirme { get; set; }        // HTML5 input placeholder (soluk metin)
    public required string Aciklama { get; set; }           // Form altı kalıcı help text
    public required string Tip { get; set; }                // 'subject'|'body'|'baslik'|'metin'|'placeholder_kisa'
    public bool Zorunlu { get; set; }                       // Onboarding wizard'da zorunlu mu
    public string DesteklenenPlaceholderlar { get; set; } = "[]";  // JSONB — izin verilen runtime placeholder'lar
    public int Sira { get; set; } = 100;                    // UI sıralama (yükselen)
    public required string Kategori { get; set; }           // 'mail'|'dashboard'|'sayac'|'bildirim'|'form'|'marka'
    public bool Deprecated { get; set; }                    // Eski anahtar; yeni tenant'lara önerilmez
    public DateTimeOffset OlusturmaZamani { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset GuncellemeZamani { get; set; } = DateTimeOffset.UtcNow;
}
/// <summary>
/// v17 — AI sağlayıcı ayarı (singleton: tek satır). Strategy Pattern (spec Bölüm 6).
/// API key DataProtection (AES-256-GCM) ile şifreli saklanır; düz metin asla tutulmaz.
/// </summary>
public sealed class AiAyari
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Saglayici { get; set; } = "openai";       // 'openai' | 'anthropic' | 'lokal'
    public string ModelId { get; set; } = "gpt-4o-mini";    // sağlayıcıya özgü model adı
    public string? ApiKeyEncrypted { get; set; }            // DataProtection şifreli; lokal'de null olabilir
    public string? BaseUrl { get; set; }                    // yalnız lokal LLM için
    public int TimeoutMs { get; set; } = 30000;             // LLM çağrı zaman aşımı (ms)
    public bool Aktif { get; set; }                         // false: AI kapalı (default — super admin elle açar)
    public DateTimeOffset? SonSaglikKontrol { get; set; }   // son sağlık testi zamanı
    public bool? SonSaglikDurum { get; set; }               // son test sonucu (null = hiç test edilmedi)
    public DateTimeOffset GuncellemeZamani { get; set; } = DateTimeOffset.UtcNow;
    public Guid? GuncelleyenKullaniciId { get; set; }       // son güncelleyen super admin
}
