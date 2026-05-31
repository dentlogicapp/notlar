using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;

namespace Notlar.Api.Background;

public sealed class CopKutusuTemizleyici : BackgroundService
{
    private readonly IServiceProvider _sp;
    private readonly ILogger<CopKutusuTemizleyici> _log;
    private static readonly TimeSpan TutmaSuresi = TimeSpan.FromDays(30);
    private static readonly TimeSpan Periyod = TimeSpan.FromHours(6);

    public CopKutusuTemizleyici(IServiceProvider sp, ILogger<CopKutusuTemizleyici> log)
    {
        _sp = sp; _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // İlk çalıştırmadan önce 5 dk bekle (uygulama açılışını bloklamasın)
        try { await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _sp.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var esik = DateTimeOffset.UtcNow - TutmaSuresi;

                var silinecek = await db.Notlar
                    .Where(n => n.Silindi && n.SilinmeZamani != null && n.SilinmeZamani < esik)
                    .ToListAsync(stoppingToken);

                if (silinecek.Count > 0)
                {
                    db.Notlar.RemoveRange(silinecek);
                    await db.SaveChangesAsync(stoppingToken);
                    _log.LogInformation("Çöp kutusu temizliği: {Sayi} not kalıcı silindi", silinecek.Count);
                }
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Çöp kutusu temizlik hatası");
            }

            try { await Task.Delay(Periyod, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
