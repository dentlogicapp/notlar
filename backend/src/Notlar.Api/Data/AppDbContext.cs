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
            e.HasIndex(x => new { x.KlasorId, x.Silindi });
            e.HasIndex(x => x.OlusturmaZamani);
            e.HasIndex(x => x.Silindi);
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
             .HasForeignKey(x => x.YapanKullaniciId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.NotId, x.YapilisZamani });
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
        });
    }
}
