using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Services;

namespace Notlar.Api.Background;

/// <summary>
/// v19 4d - Sessiz saat ertelenmis bildirim kuyrugunu bosaltir.
/// Her 1 dakikada: sessiz araligi biten (ya da sessiz saati kapatmis) kullanicilarin
/// ertelenmis bildirimlerini gonderir. 3 ve altiysa tek tek, fazlaysa tek ozet ("N bildiriminiz oldu").
/// Hatirlatici bu kuyruga hic girmez (PushGonderici'de sessizSaateTabi=false ile aninda gider).
/// </summary>
public sealed class SessizSaatBosaltici : BackgroundService
{
    private readonly IServiceProvider _sp;
    private readonly ILogger<SessizSaatBosaltici> _log;
    private static readonly TimeSpan Periyod = TimeSpan.FromMinutes(1);

    public SessizSaatBosaltici(IServiceProvider sp, ILogger<SessizSaatBosaltici> log)
    {
        _sp = sp; _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Ilk calistirma icin 45 sn bekle (app acilisini bloklamasin)
        await Task.Delay(TimeSpan.FromSeconds(45), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await BosaltAsync(stoppingToken); }
            catch (Exception ex) { _log.LogError(ex, "Sessiz saat bosaltma dongusunde hata"); }

            try { await Task.Delay(Periyod, stoppingToken); }
            catch (TaskCanceledException) { break; }
        }
    }

    private async Task BosaltAsync(CancellationToken ct)
    {
        using var scope = _sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var push = scope.ServiceProvider.GetRequiredService<IPushGonderici>();

        // Kuyrukta bekleyen bildirimi olan kullanicilar
        var kullaniciIdler = await db.ErtelenenBildirimler
            .Select(e => e.KullaniciId).Distinct().ToListAsync(ct);
        if (kullaniciIdler.Count == 0) return;

        foreach (var uid in kullaniciIdler)
        {
            var ka = await db.Kullanicilar
                .Where(k => k.Id == uid)
                .Select(k => new { k.SessizSaatAktif, k.SessizSaatBaslangic, k.SessizSaatBitis })
                .FirstOrDefaultAsync(ct);
            if (ka is null) continue;

            // Hala sessiz saatteyse bekle (sessiz saat acik VE araliktayiz)
            if (ka.SessizSaatAktif && PushGonderici.SessizSaatteMi(ka.SessizSaatBaslangic, ka.SessizSaatBitis))
                continue;

            // Sessiz saat bitti (ya da kapatildi) -> kuyrugu bosalt
            var ertelenenler = await db.ErtelenenBildirimler
                .Where(e => e.KullaniciId == uid)
                .OrderBy(e => e.OlusturmaZamani)
                .ToListAsync(ct);
            if (ertelenenler.Count == 0) continue;

            if (ertelenenler.Count <= 3)
            {
                // Az sayida: her birini orijinal haliyle tek tek gonder
                foreach (var e in ertelenenler)
                    await push.GonderAsync(uid, e.Baslik, e.Govde, e.Url, sessizSaateTabi: false, ct);
            }
            else
            {
                // Cok sayida: tek ozet bildirim (telefonu bogmaz, hicbiri kaybolmaz)
                await push.GonderAsync(
                    uid,
                    $"{ertelenenler.Count} yeni bildirim",
                    $"Sessiz saatlerde {ertelenenler.Count} bildiriminiz oldu.",
                    "/",
                    sessizSaateTabi: false,
                    ct);
            }

            db.ErtelenenBildirimler.RemoveRange(ertelenenler);
            await db.SaveChangesAsync(ct);
            _log.LogInformation("Sessiz saat kuyrugu bosaltildi: Kullanici {Uid}, {Adet} bildirim", uid, ertelenenler.Count);
        }
    }
}
