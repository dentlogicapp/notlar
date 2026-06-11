using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Services;

namespace Notlar.Api.Background;

/// <summary>
/// v19 B8 — Hareketsiz tenant tarayicisi.
///
/// Gunde bir kez tarar: son 30 gun icinde hicbir denetim_gunlukleri kaydi olmayan
/// (= hareketsiz) aktif tenant'lar icin super admin'lere operasyonel bildirim gonderir.
///
/// Spam korumasi (defense in depth):
///   - Cooldown: SonInaktifBildirim son 7 gun icindeyse tekrar mail atilmaz.
///   - Yeni tenant guard: OlusturmaZamani 30 gunden yeniyse inaktif sayilmaz (henuz kullanilmamis = normal).
///   - Idempotent: SonInaktifBildirim damgasi tekrar taramada ayni tenant'i elemeye yarar.
///
/// HatirlaticiKontrolcusu pattern'i (BackgroundService + scope + try/catch loop) izlenir.
/// </summary>
public sealed class InaktifTenantTarayici : BackgroundService
{
    private readonly IServiceProvider _sp;
    private readonly ILogger<InaktifTenantTarayici> _log;
    private static readonly TimeSpan Periyod = TimeSpan.FromHours(24);
    private const int InaktifGunEsigi = 30;
    private const int CooldownGun = 7;

    public InaktifTenantTarayici(IServiceProvider sp, ILogger<InaktifTenantTarayici> log)
    {
        _sp = sp; _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // App acilisini bloklamasin diye ilk taramayi 2 dk geciktir.
        await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TaraAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Inaktif tenant tarama dongusunde hata");
            }

            try { await Task.Delay(Periyod, stoppingToken); }
            catch (TaskCanceledException) { break; }
        }
    }

    private async Task TaraAsync(CancellationToken ct)
    {
        using var scope = _sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var bildirim = scope.ServiceProvider.GetRequiredService<IOperasyonelBildirimGonderici>();

        var simdi = DateTimeOffset.UtcNow;
        var inaktifEsik = simdi.AddDays(-InaktifGunEsigi);
        var cooldownEsik = simdi.AddDays(-CooldownGun);

        // Son 30 gun icinde EN AZ BIR audit kaydi olan tenant id'leri (= aktif kullanim).
        var aktifKullanimIdler = await db.DenetimGunlukleri
            .Where(d => d.IsletmeId != null && d.Zaman >= inaktifEsik)
            .Select(d => d.IsletmeId!.Value)
            .Distinct()
            .ToListAsync(ct);

        // Aktif + silinmemis + en az 30 gundur var + son 30 gun hareketsiz + cooldown disinda.
        var inaktifler = await db.Isletmeler
            .Where(i => i.Aktif && !i.Silindi
                     && i.OlusturmaZamani < inaktifEsik
                     && !aktifKullanimIdler.Contains(i.Id)
                     && (i.SonInaktifBildirim == null || i.SonInaktifBildirim < cooldownEsik))
            .ToListAsync(ct);

        if (inaktifler.Count == 0) return;

        foreach (var t in inaktifler)
        {
            bildirim.Inaktif30Gun(t.MarkaAdi, InaktifGunEsigi);
            t.SonInaktifBildirim = simdi;
        }

        await db.SaveChangesAsync(ct);
        _log.LogInformation("Inaktif tenant tarama: {Sayi} hareketsiz tenant icin bildirim tetiklendi", inaktifler.Count);
    }
}
