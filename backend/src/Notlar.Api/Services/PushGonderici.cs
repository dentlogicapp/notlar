using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using System.Text.Json;
using WebPush;

namespace Notlar.Api.Services;

// Web Push gonderim servisi. Bir kullanicinin tum Web Push abone cihazlarina gonderir;
// gecersiz (410/404) abonelikleri otomatik temizler; her gonderimi denetim_gunlukleri'ne yazar.
public interface IPushGonderici
{
    Task GonderAsync(Guid kullaniciId, string baslik, string govde, string? url = null, CancellationToken ct = default);
}

public sealed class PushGonderici : IPushGonderici
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<PushGonderici> _log;
    private readonly WebPushClient _client = new();

    public PushGonderici(IServiceScopeFactory scopeFactory, IConfiguration config, ILogger<PushGonderici> log)
    {
        _scopeFactory = scopeFactory;
        _config = config;
        _log = log;
    }

    public async Task GonderAsync(Guid kullaniciId, string baslik, string govde, string? url = null, CancellationToken ct = default)
    {
        var pub = _config["Vapid:PublicKey"];
        var priv = _config["Vapid:PrivateKey"];
        var subject = _config["Vapid:Subject"] ?? "mailto:destek@dentlogicapp.com";
        if (string.IsNullOrWhiteSpace(pub) || string.IsNullOrWhiteSpace(priv))
        {
            _log.LogWarning("Push gonderilemedi: VAPID anahtarlari yapilandirilmamis (Vapid:PublicKey/PrivateKey)");
            return;
        }
        var vapid = new VapidDetails(subject, pub, priv);

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var audit = scope.ServiceProvider.GetRequiredService<IAuditService>();

        // Yalnizca Web Push abone cihazlar (p256dh + auth dolu)
        var cihazlar = await db.KullaniciCihazlari
            .Where(c => c.KullaniciId == kullaniciId && c.PushP256dh != null && c.PushAuth != null)
            .ToListAsync(ct);
        if (cihazlar.Count == 0) return;

        var payload = JsonSerializer.Serialize(new
        {
            title = baslik,
            body = govde,
            data = new { url },
        });

        var basarili = 0;
        var gecersizler = new List<KullaniciCihaz>();
        foreach (var c in cihazlar)
        {
            try
            {
                var sub = new PushSubscription(c.PushToken, c.PushP256dh, c.PushAuth);
                await _client.SendNotificationAsync(sub, payload, vapid);
                basarili++;
            }
            catch (WebPushException ex)
            {
                // 410 Gone / 404 NotFound -> abonelik gecersiz, temizle (kendi kendini onaran)
                var kod = (int)ex.StatusCode;
                if (kod == 410 || kod == 404) gecersizler.Add(c);
                else _log.LogWarning(ex, "Push gonderim hatasi (cihaz {CihazId}, kod {Kod})", c.Id, kod);
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Push gonderim beklenmeyen hata (cihaz {CihazId})", c.Id);
            }
        }

        // Gecersiz abonelikleri sil
        if (gecersizler.Count > 0)
        {
            db.KullaniciCihazlari.RemoveRange(gecersizler);
            await db.SaveChangesAsync(ct);
        }

        // Teslimat denetimi (append-only audit)
        await audit.YazAsync(
            "push_gonderildi",
            hedefTip: "kullanici",
            hedefId: kullaniciId,
            degisenAlanlar: JsonSerializer.Serialize(new
            {
                baslik,
                cihaz_sayisi = cihazlar.Count,
                basarili,
                temizlenen_gecersiz = gecersizler.Count,
            }),
            ct: ct);
    }
}
