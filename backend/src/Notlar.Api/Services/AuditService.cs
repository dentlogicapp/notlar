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

    public AuditService(AppDbContext db, IUserContext user)
    {
        _db = db;
        _user = user;
    }

    public async Task YazAsync(
        string olay, string? hedefTip = null, Guid? hedefId = null,
        Guid? aktorId = null, string? aktorEmail = null,
        string? degisenAlanlar = null, string? detay = null,
        CancellationToken ct = default)
    {
        _db.DenetimGunlukleri.Add(new DenetimGunlugu
        {
            Olay = olay,
            HedefTip = hedefTip,
            HedefId = hedefId,
            AktorKullaniciId = aktorId ?? _user.KullaniciId,
            AktorEmail = aktorEmail ?? _user.Email,
            Ip = _user.Ip,
            KullaniciAjan = _user.KullaniciAjan,
            DegisenAlanlar = degisenAlanlar,
            Detay = detay
        });
        await _db.SaveChangesAsync(ct);
    }
}
