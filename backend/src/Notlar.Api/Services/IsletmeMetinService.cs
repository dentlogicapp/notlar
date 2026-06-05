using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Entities;

namespace Notlar.Api.Services;

/// <summary>
/// v18 - Tenant icerigi (isletme_metinleri) yonetimi + version history.
/// Senaryo A: repository katmani yok, dogrudan AppDbContext (AuditService pattern).
/// Tenant izolasyon: tum metotlar isletmeId filtreli. Kaydet/versiyona-don atomik.
/// </summary>
public interface IIsletmeMetinService
{
    Task<IReadOnlyList<IsletmeMetni>> TumunuGetirAsync(Guid isletmeId, CancellationToken ct = default);
    Task<IsletmeMetni?> GetirAsync(Guid isletmeId, string anahtar, CancellationToken ct = default);
    Task<IsletmeMetni> KaydetAsync(Guid isletmeId, string anahtar, string icerik, Guid? kullaniciId, CancellationToken ct = default);
    Task<bool> SifirlaAsync(Guid isletmeId, string anahtar, Guid? kullaniciId, CancellationToken ct = default);
    Task<IReadOnlyList<IsletmeMetinVersiyonu>> VersiyonlariGetirAsync(Guid isletmeId, string anahtar, CancellationToken ct = default);
    Task<bool> VersiyonaDonAsync(Guid isletmeId, string anahtar, Guid versiyonId, Guid? kullaniciId, CancellationToken ct = default);
}

public sealed class IsletmeMetinService : IIsletmeMetinService
{
    private const int SaklananVersiyon = 10;   // son 10 versiyon tutulur (spec 2.4)

    private readonly AppDbContext _db;

    public IsletmeMetinService(AppDbContext db) => _db = db;

    public async Task<IReadOnlyList<IsletmeMetni>> TumunuGetirAsync(Guid isletmeId, CancellationToken ct = default)
        => await _db.IsletmeMetinleri
            .Where(x => x.IsletmeId == isletmeId)
            .OrderBy(x => x.Anahtar)
            .ToListAsync(ct);

    public Task<IsletmeMetni?> GetirAsync(Guid isletmeId, string anahtar, CancellationToken ct = default)
        => _db.IsletmeMetinleri
            .FirstOrDefaultAsync(x => x.IsletmeId == isletmeId && x.Anahtar == anahtar, ct);

    /// <summary>
    /// UPSERT: kayit varsa eski icerigi versiyonlar tablosuna kopyalar, sonra gunceller + son 10'u budar.
    /// Yoksa yeni kayit (ilk versiyon, kopyalama yok). Versiyon + guncelleme tek SaveChanges -> atomik.
    /// </summary>
    public async Task<IsletmeMetni> KaydetAsync(Guid isletmeId, string anahtar, string icerik, Guid? kullaniciId, CancellationToken ct = default)
    {
        var mevcut = await _db.IsletmeMetinleri
            .FirstOrDefaultAsync(x => x.IsletmeId == isletmeId && x.Anahtar == anahtar, ct);

        if (mevcut is null)
        {
            var yeni = new IsletmeMetni
            {
                IsletmeId = isletmeId,
                Anahtar = anahtar,
                Icerik = icerik,
                GuncelleyenKullaniciId = kullaniciId,
            };
            _db.IsletmeMetinleri.Add(yeni);
            await _db.SaveChangesAsync(ct);
            return yeni;
        }

        if (mevcut.Icerik == icerik) return mevcut;   // degisiklik yok, no-op

        // Eski icerigi versiyonla
        var sonVersiyon = await _db.IsletmeMetinVersiyonlari
            .Where(v => v.IsletmeId == isletmeId && v.Anahtar == anahtar)
            .MaxAsync(v => (int?)v.Versiyon, ct) ?? 0;

        _db.IsletmeMetinVersiyonlari.Add(new IsletmeMetinVersiyonu
        {
            IsletmeId = isletmeId,
            Anahtar = anahtar,
            Icerik = mevcut.Icerik,
            Versiyon = sonVersiyon + 1,
            OlusturanKullaniciId = mevcut.GuncelleyenKullaniciId,
        });

        mevcut.Icerik = icerik;
        mevcut.GuncellemeZamani = DateTimeOffset.UtcNow;
        mevcut.GuncelleyenKullaniciId = kullaniciId;
        await _db.SaveChangesAsync(ct);   // versiyon + guncelleme atomik

        await BudaAsync(isletmeId, anahtar, ct);
        await _db.SaveChangesAsync(ct);   // budama (yeni versiyon artik DB'de, son 10 dogru sayilir)
        return mevcut;
    }

    public async Task<bool> SifirlaAsync(Guid isletmeId, string anahtar, Guid? kullaniciId, CancellationToken ct = default)
    {
        var mevcut = await _db.IsletmeMetinleri
            .FirstOrDefaultAsync(x => x.IsletmeId == isletmeId && x.Anahtar == anahtar, ct);
        if (mevcut is null) return false;   // zaten sistem varsayilani

        // Sifirlama = tenant override kaldir; son icerigi versiyonla (geri alinabilir kalsin)
        var sonVersiyon = await _db.IsletmeMetinVersiyonlari
            .Where(v => v.IsletmeId == isletmeId && v.Anahtar == anahtar)
            .MaxAsync(v => (int?)v.Versiyon, ct) ?? 0;
        _db.IsletmeMetinVersiyonlari.Add(new IsletmeMetinVersiyonu
        {
            IsletmeId = isletmeId,
            Anahtar = anahtar,
            Icerik = mevcut.Icerik,
            Versiyon = sonVersiyon + 1,
            OlusturanKullaniciId = kullaniciId,
        });
        _db.IsletmeMetinleri.Remove(mevcut);
        await _db.SaveChangesAsync(ct);

        await BudaAsync(isletmeId, anahtar, ct);
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<IReadOnlyList<IsletmeMetinVersiyonu>> VersiyonlariGetirAsync(Guid isletmeId, string anahtar, CancellationToken ct = default)
        => await _db.IsletmeMetinVersiyonlari
            .Where(v => v.IsletmeId == isletmeId && v.Anahtar == anahtar)
            .OrderByDescending(v => v.Versiyon)
            .Take(SaklananVersiyon)
            .ToListAsync(ct);

    /// <summary>
    /// Eski versiyona don: secilen versiyon icerigini KaydetAsync ile current yapar
    /// (mevcut current otomatik yeni versiyon olur). Versiyon bulunamazsa false.
    /// </summary>
    public async Task<bool> VersiyonaDonAsync(Guid isletmeId, string anahtar, Guid versiyonId, Guid? kullaniciId, CancellationToken ct = default)
    {
        var versiyon = await _db.IsletmeMetinVersiyonlari
            .FirstOrDefaultAsync(v => v.Id == versiyonId && v.IsletmeId == isletmeId && v.Anahtar == anahtar, ct);
        if (versiyon is null) return false;

        await KaydetAsync(isletmeId, anahtar, versiyon.Icerik, kullaniciId, ct);
        return true;
    }

    // Son 10 disindaki eski versiyonlari sil (inline budama; background job yerine)
    private async Task BudaAsync(Guid isletmeId, string anahtar, CancellationToken ct)
    {
        var fazla = await _db.IsletmeMetinVersiyonlari
            .Where(v => v.IsletmeId == isletmeId && v.Anahtar == anahtar)
            .OrderByDescending(v => v.Versiyon)
            .Skip(SaklananVersiyon)
            .ToListAsync(ct);
        if (fazla.Count > 0) _db.IsletmeMetinVersiyonlari.RemoveRange(fazla);
    }
}