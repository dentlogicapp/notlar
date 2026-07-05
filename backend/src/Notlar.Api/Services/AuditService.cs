using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Entities;

namespace Notlar.Api.Services;

public interface IAuditService
{
    Task YazAsync(
        string olay, string? hedefTip = null, Guid? hedefId = null,
        Guid? aktorId = null, string? aktorEmail = null,
        string? degisenAlanlar = null, string? detay = null,
        CancellationToken ct = default);
}

public sealed class AuditService : IAuditService
{
    private readonly AppDbContext _db;
    private readonly IUserContext _user;
    private readonly IAkisYayinci _akis;

    public AuditService(AppDbContext db, IUserContext user, IAkisYayinci akis)
    {
        _db = db;
        _user = user;
        _akis = akis;
    }

    public async Task YazAsync(
        string olay, string? hedefTip = null, Guid? hedefId = null,
        Guid? aktorId = null, string? aktorEmail = null,
        string? degisenAlanlar = null, string? detay = null,
        CancellationToken ct = default)
    {
        var kayit = new DenetimGunlugu
        {
            IsletmeId = _user.AktifIsletmeId,  // v15 — nullable: super admin işlemleri tenant-bağımsız (null)
            Olay = olay,
            HedefTip = hedefTip,
            HedefId = hedefId,
            AktorKullaniciId = aktorId ?? _user.KullaniciId,
            AktorEmail = aktorEmail ?? _user.Email,
            Ip = _user.Ip,
            KullaniciAjan = _user.KullaniciAjan,
            DegisenAlanlar = degisenAlanlar,
            Detay = detay
        };
        _db.DenetimGunlukleri.Add(kayit);
        await _db.SaveChangesAsync(ct);

        // v21 M6 (KN3) - saklama politikasi: tenant basina SON 500 kayit tutulur.
        // Her yazimda 500'u asan EN ESKI kayitlar kalici silinir - YALNIZ tenant-scoped
        // (IsletmeId NULL sistem kayitlarina dokunulmaz). Append-only ilkesi korunur:
        // bu kayit degistirme degil, saklama suresi politikasidir. Parametreli SQL
        // (interpolated ExecuteSqlAsync) - injection yuzeyi yok.
        if (kayit.IsletmeId is not null)
        {
            await _db.Database.ExecuteSqlAsync($"""
                DELETE FROM denetim_gunlukleri
                WHERE "Id" IN (
                    SELECT "Id" FROM denetim_gunlukleri
                    WHERE "IsletmeId" = {kayit.IsletmeId}
                    ORDER BY "Zaman" DESC
                    OFFSET 500
                )
                """, ct);
        }

        // v19 Asama 7 - SSE: audit kalici olduktan SONRA super admin feed'e yayinla.
        // TryWrite tabanli, throw etmez; audit yazimini etkilemez (paralel degil, hook).
        _akis.Yayinla(new AkisOlayi(
            kayit.Olay, kayit.HedefTip, kayit.HedefId, kayit.IsletmeId,
            kayit.AktorEmail, _user.AdSoyad, kayit.Detay, kayit.DegisenAlanlar, kayit.Zaman));
    }
}
