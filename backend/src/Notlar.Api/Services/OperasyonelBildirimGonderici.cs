using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;

namespace Notlar.Api.Services;

/// <summary>
/// v19 B8 — Operasyonel bildirim gonderici (super admin'lere sistem olaylari).
///
/// Tasarim:
///   - Fire-and-forget: endpoint response'unu BEKLETMEZ (Task.Run). Mail SMTP gecikmesi
///     kullaniciyi etkilemez. Hata yutulur + loglanir (bildirim best-effort, kritik degil).
///   - Singleton: scoped servislere (AppDbContext, IEmailService) IServiceScopeFactory ile erisir.
///   - Alici: aktif + opt-in (OperasyonelBildirimAl) + kurulmus (SifreHash dolu) super adminler.
/// </summary>
public interface IOperasyonelBildirimGonderici
{
    void TenantOlusturuldu(string markaAdi, string olusturanEmail);
    void TenantPasiflestirildi(string markaAdi, string aktorEmail);
    void SuperAdminAtandi(string atananEmail, string aktorEmail);
    void SuperAdminKaldirildi(string kaldirilanEmail, string aktorEmail);
    void Inaktif30Gun(string markaAdi, int gun);
}

public sealed class OperasyonelBildirimGonderici : IOperasyonelBildirimGonderici
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OperasyonelBildirimGonderici> _log;

    public OperasyonelBildirimGonderici(IServiceScopeFactory scopeFactory, ILogger<OperasyonelBildirimGonderici> log)
    {
        _scopeFactory = scopeFactory;
        _log = log;
    }

    public void TenantOlusturuldu(string markaAdi, string olusturanEmail)
        => Tetikle(OperasyonelTemplate.TenantOlusturuldu(markaAdi, olusturanEmail));

    public void TenantPasiflestirildi(string markaAdi, string aktorEmail)
        => Tetikle(OperasyonelTemplate.TenantPasiflestirildi(markaAdi, aktorEmail));

    public void SuperAdminAtandi(string atananEmail, string aktorEmail)
        => Tetikle(OperasyonelTemplate.SuperAdminAtandi(atananEmail, aktorEmail));

    public void SuperAdminKaldirildi(string kaldirilanEmail, string aktorEmail)
        => Tetikle(OperasyonelTemplate.SuperAdminKaldirildi(kaldirilanEmail, aktorEmail));

    public void Inaktif30Gun(string markaAdi, int gun)
        => Tetikle(OperasyonelTemplate.Inaktif30Gun(markaAdi, gun));

    private void Tetikle((string Konu, string Html) icerik)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var email = scope.ServiceProvider.GetRequiredService<IEmailService>();

                var alicilar = await db.Kullanicilar
                    .Where(k => k.SuperAdmin && k.Aktif && k.OperasyonelBildirimAl && k.SifreHash != null)
                    .Select(k => new { k.Email, k.AdSoyad })
                    .ToListAsync();

                foreach (var a in alicilar)
                    await email.OperasyonelMailGonderAsync(a.Email, a.AdSoyad, icerik);

                _log.LogInformation("Operasyonel bildirim gonderildi: {Konu} ({Sayi} alici)", icerik.Konu, alicilar.Count);
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Operasyonel bildirim gonderilemedi: {Konu}", icerik.Konu);
            }
        });
    }
}
