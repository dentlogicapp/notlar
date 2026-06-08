using Microsoft.EntityFrameworkCore;
using Notlar.Api.Entities;

namespace Notlar.Api.Data;

public sealed class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Kullanici> Kullanicilar => Set<Kullanici>();
    public DbSet<AuthToken> AuthTokenlar => Set<AuthToken>();
    public DbSet<Klasor> Klasorler => Set<Klasor>();
    public DbSet<Not> Notlar => Set<Not>();
    public DbSet<NotGecmisi> NotGecmisleri => Set<NotGecmisi>();
    public DbSet<DenetimGunlugu> DenetimGunlukleri => Set<DenetimGunlugu>();
    public DbSet<Bildirim> Bildirimler => Set<Bildirim>();
    // v15 — Multi-tenant
    public DbSet<Isletme> Isletmeler => Set<Isletme>();
    public DbSet<IsletmeUyelik> IsletmeUyelikleri => Set<IsletmeUyelik>();
    // v17 — Sistem metin anahtar kataloğu
    public DbSet<MetinAnahtari> MetinAnahtarlari => Set<MetinAnahtari>();
    // v17 - AI saglayici ayari (singleton)
    public DbSet<AiAyari> AiAyarlari => Set<AiAyari>();

    // v18 - Sifir Sablon KATMAN 2 (tenant icerigi + version history)
    public DbSet<IsletmeMetni> IsletmeMetinleri => Set<IsletmeMetni>();
    public DbSet<IsletmeMetinVersiyonu> IsletmeMetinVersiyonlari => Set<IsletmeMetinVersiyonu>();

    protected override void OnModelCreating(ModelBuilder m)
    {
        m.Entity<Kullanici>(e =>
        {
            e.ToTable("kullanicilar");
            e.HasKey(x => x.Id);
            e.Property(x => x.Email).HasMaxLength(254).IsRequired();
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.AdSoyad).HasMaxLength(120).IsRequired();
            e.Property(x => x.Rol).HasMaxLength(20).IsRequired();
            e.Property(x => x.SifreHash).HasMaxLength(255);
            e.Property(x => x.Cinsiyet).HasMaxLength(10);  // "kadin" | "erkek"
            // v15
            e.HasIndex(x => x.SuperAdmin).HasFilter("\"SuperAdmin\" = true");
        });

        // v15 — İşletme (Tenant)
        m.Entity<Isletme>(e =>
        {
            e.ToTable("isletmeler");
            e.HasKey(x => x.Id);
            e.Property(x => x.MarkaAdi).HasMaxLength(80).IsRequired();
            e.Property(x => x.MarkaEmoji).HasMaxLength(10);
            e.Property(x => x.IkonSeti).HasMaxLength(20);
            e.Property(x => x.KarsilamaBasligi).HasMaxLength(120);
            e.Property(x => x.KarsilamaAltMetni).HasMaxLength(280);
            e.Property(x => x.SayacBasligi).HasMaxLength(60);
            e.Property(x => x.MailImza).HasMaxLength(80);
            e.Property(x => x.MailTonu).HasMaxLength(20);
            e.Property(x => x.KullanimModu).HasMaxLength(20);
            e.HasIndex(x => x.Aktif);
            e.HasIndex(x => x.Silindi);
        });

        // v15 — İşletme Üyelikleri
        m.Entity<IsletmeUyelik>(e =>
        {
            e.ToTable("isletme_uyelikleri");
            e.HasKey(x => x.Id);
            e.Property(x => x.Rol).HasMaxLength(20).IsRequired();
            e.HasOne(x => x.Isletme).WithMany(i => i.Uyelikler)
             .HasForeignKey(x => x.IsletmeId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Kullanici).WithMany(u => u.Uyelikler)
             .HasForeignKey(x => x.KullaniciId).OnDelete(DeleteBehavior.Cascade);
            // Bir kullanıcı bir tenant'a tek üyelik
            e.HasIndex(x => new { x.IsletmeId, x.KullaniciId }).IsUnique();
            e.HasIndex(x => x.KullaniciId);
        });

        m.Entity<AuthToken>(e =>
        {
            e.ToTable("auth_tokenlar");
            e.HasKey(x => x.Id);
            e.Property(x => x.Token).HasMaxLength(96).IsRequired();
            e.HasIndex(x => x.Token).IsUnique();
            e.Property(x => x.Amac).HasMaxLength(20).IsRequired();
            e.HasOne(x => x.Kullanici).WithMany(u => u.Tokenler)
             .HasForeignKey(x => x.KullaniciId).OnDelete(DeleteBehavior.Cascade);
        });

        m.Entity<Klasor>(e =>
        {
            e.ToTable("klasorler");
            e.HasKey(x => x.Id);
            e.Property(x => x.Ad).HasMaxLength(120).IsRequired();
            e.Property(x => x.Aciklama).HasMaxLength(500);
            e.Property(x => x.Ikon).HasMaxLength(50);
            e.HasOne(x => x.UstKlasor).WithMany(u => u.AltKlasorler)
             .HasForeignKey(x => x.UstKlasorId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.OlusturanKullanici).WithMany(u => u.OlusturduguKlasorler)
             .HasForeignKey(x => x.OlusturanKullaniciId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => x.UstKlasorId);
            e.HasIndex(x => x.Silindi);
            e.HasIndex(x => x.SistemMi);  // Tamamlananlar lookup için
            // v15 — Tenant
            e.HasOne<Isletme>().WithMany()
             .HasForeignKey(x => x.IsletmeId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.IsletmeId, x.Silindi });
        });

        m.Entity<Not>(e =>
        {
            e.ToTable("notlar");
            e.HasKey(x => x.Id);
            e.Property(x => x.Baslik).HasMaxLength(200).IsRequired();
            e.Property(x => x.Icerik).HasMaxLength(5000);
            e.Property(x => x.TamamlanmaAciklamasi).HasMaxLength(2000);
            e.HasOne(x => x.Klasor).WithMany(k => k.Notlar)
             .HasForeignKey(x => x.KlasorId).OnDelete(DeleteBehavior.SetNull);
            e.HasOne(x => x.OlusturanKullanici).WithMany(u => u.OlusturduguNotlar)
             .HasForeignKey(x => x.OlusturanKullaniciId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.TamamlayanKullanici).WithMany()
             .HasForeignKey(x => x.TamamlayanKullaniciId).OnDelete(DeleteBehavior.SetNull);
            // Hatırlatıcı kolonları
            e.Property(x => x.HatirlatmaKime).HasMaxLength(10);    // askima/bana/ikimize
            e.Property(x => x.HatirlatmaSekli).HasMaxLength(15);   // uygulama/email/her_ikisi
            e.HasIndex(x => new { x.KlasorId, x.Silindi });
            e.HasIndex(x => x.OlusturmaZamani);
            e.HasIndex(x => x.Silindi);
            // Background service her dakika bunu sorgular: NOW() >= zamani AND !gonderildi
            e.HasIndex(x => new { x.HatirlatmaZamani, x.HatirlatmaGonderildiMi });
            // v15 — Tenant
            e.HasOne<Isletme>().WithMany()
             .HasForeignKey(x => x.IsletmeId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.IsletmeId, x.Silindi });
        });

        m.Entity<NotGecmisi>(e =>
        {
            e.ToTable("not_gecmisi");
            e.HasKey(x => x.Id);
            e.Property(x => x.Eylem).HasMaxLength(40).IsRequired();
            e.Property(x => x.Aciklama).HasMaxLength(2000);
            e.HasOne(x => x.Not).WithMany(n => n.Gecmis)
             .HasForeignKey(x => x.NotId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.YapanKullanici).WithMany()
             .HasForeignKey(x => x.YapanKullaniciId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => new { x.NotId, x.YapilisZamani });
            // v15 — Tenant
            e.HasOne<Isletme>().WithMany()
             .HasForeignKey(x => x.IsletmeId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.IsletmeId);
        });

        m.Entity<DenetimGunlugu>(e =>
        {
            e.ToTable("denetim_gunlukleri");
            e.HasKey(x => x.Id);
            e.Property(x => x.Olay).HasMaxLength(60).IsRequired();
            e.Property(x => x.HedefTip).HasMaxLength(40);
            e.Property(x => x.AktorEmail).HasMaxLength(254);
            e.Property(x => x.Ip).HasMaxLength(64);
            e.Property(x => x.KullaniciAjan).HasMaxLength(500);
            e.Property(x => x.DegisenAlanlar).HasColumnType("jsonb");
            e.HasIndex(x => x.Zaman);
            e.HasIndex(x => x.Olay);
            e.HasIndex(x => x.AktorKullaniciId);
            // v15 — Tenant (nullable: super admin işlemleri tenant-bağımsız)
            e.HasOne<Isletme>().WithMany()
             .HasForeignKey(x => x.IsletmeId).OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(x => new { x.IsletmeId, x.Zaman });
        });

        m.Entity<Bildirim>(e =>
        {
            e.ToTable("bildirimler");
            e.HasKey(x => x.Id);
            e.Property(x => x.Tip).HasMaxLength(30).IsRequired();
            e.Property(x => x.Baslik).HasMaxLength(120).IsRequired();
            e.Property(x => x.Mesaj).HasMaxLength(500).IsRequired();
            e.HasOne(x => x.Kullanici).WithMany(u => u.Bildirimler)
             .HasForeignKey(x => x.KullaniciId).OnDelete(DeleteBehavior.Cascade);
            // UserMenu unread count + listeleme sıralaması için
            e.HasIndex(x => new { x.KullaniciId, x.OkunduMu, x.OlusturmaZamani });
            // v15 — Tenant
            e.HasOne<Isletme>().WithMany()
             .HasForeignKey(x => x.IsletmeId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.IsletmeId, x.KullaniciId });
        });
        // v17 — Sistem metin anahtar kataloğu
        m.Entity<MetinAnahtari>(e =>
        {
            e.ToTable("metin_anahtarlari");
            e.HasKey(x => x.Id);
            e.Property(x => x.Anahtar).HasMaxLength(80).IsRequired();
            e.Property(x => x.Etiket).HasMaxLength(120).IsRequired();
            e.Property(x => x.Yonlendirme).IsRequired();
            e.Property(x => x.Aciklama).IsRequired();
            e.Property(x => x.Tip).HasMaxLength(20).IsRequired();
            e.Property(x => x.Kategori).HasMaxLength(40).IsRequired();
            e.Property(x => x.DesteklenenPlaceholderlar)
             .HasColumnType("jsonb").HasDefaultValueSql("'[]'::jsonb");
            e.Property(x => x.Sira).HasDefaultValue(100);
            e.Property(x => x.KarakterLimiti);  // v18 Asama 11.8 - nullable, default yok (null = tip default)
            e.HasIndex(x => x.Anahtar).IsUnique();
            e.HasIndex(x => x.Kategori);
            e.HasIndex(x => x.Deprecated);
        });
        // v17 — AI sağlayıcı ayarı (singleton: tek satır, index gereksiz)
        m.Entity<AiAyari>(e =>
        {
            e.ToTable("ai_ayarlari");
            e.HasKey(x => x.Id);
            e.Property(x => x.Saglayici).HasMaxLength(40).IsRequired();
            e.Property(x => x.ModelId).HasMaxLength(120).IsRequired();
            e.Property(x => x.BaseUrl).HasMaxLength(500);
            e.Property(x => x.TimeoutMs).HasDefaultValue(30000);
            // ApiKeyEncrypted: text (uzunluk siniri yok) — DataProtection cipher
            e.HasOne<Kullanici>().WithMany()
             .HasForeignKey(x => x.GuncelleyenKullaniciId).OnDelete(DeleteBehavior.SetNull);
        });

        // v18 - isletme_metinleri (tenant icerigi, Sifir Sablon KATMAN 2)
        m.Entity<IsletmeMetni>(e =>
        {
            e.ToTable("isletme_metinleri");
            e.Property(x => x.Anahtar).HasMaxLength(80).IsRequired();
            e.Property(x => x.Icerik).IsRequired();
            e.HasIndex(x => new { x.IsletmeId, x.Anahtar }).IsUnique();
            e.HasIndex(x => x.IsletmeId);
            e.HasIndex(x => x.Anahtar);
            e.HasOne<Isletme>().WithMany()
             .HasForeignKey(x => x.IsletmeId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<Kullanici>().WithMany()
             .HasForeignKey(x => x.GuncelleyenKullaniciId).OnDelete(DeleteBehavior.SetNull);
        });

        // v18 - isletme_metin_versiyonlari (version history)
        m.Entity<IsletmeMetinVersiyonu>(e =>
        {
            e.ToTable("isletme_metin_versiyonlari");
            e.Property(x => x.Anahtar).HasMaxLength(80).IsRequired();
            e.Property(x => x.Icerik).IsRequired();
            e.HasIndex(x => new { x.IsletmeId, x.Anahtar, x.Versiyon });
            e.HasOne<Isletme>().WithMany()
             .HasForeignKey(x => x.IsletmeId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<Kullanici>().WithMany()
             .HasForeignKey(x => x.OlusturanKullaniciId).OnDelete(DeleteBehavior.SetNull);
        });
    }
}
