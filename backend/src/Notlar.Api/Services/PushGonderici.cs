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
    Task GonderAsync(Guid kullaniciId, string baslik, string govde, string? url = null, bool sessizSaateTabi = true, CancellationToken ct = default);
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

    public async Task GonderAsync(Guid kullaniciId, string baslik, string govde, string? url = null, bool sessizSaateTabi = true, CancellationToken ct = default)
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

        // v19 4d - sessiz saat kontrolu (hatirlatici MUAF: sessizSaateTabi=false ile cagrilir).
        // Sessiz aralikta isek bildirimi kuyruga al, gonderme; SessizSaatBosaltici sabah toplu gonderir.
        if (sessizSaateTabi)
        {
            var ka = await db.Kullanicilar
                .Where(k => k.Id == kullaniciId)
                .Select(k => new { k.SessizSaatAktif, k.SessizSaatBaslangic, k.SessizSaatBitis, k.AktifIsletmeId })
                .FirstOrDefaultAsync(ct);
            if (ka is not null && ka.SessizSaatAktif && SessizSaatteMi(ka.SessizSaatBaslangic, ka.SessizSaatBitis))
            {
                db.ErtelenenBildirimler.Add(new ErtelenenBildirim
                {
                    IsletmeId = ka.AktifIsletmeId ?? Guid.Empty,
                    KullaniciId = kullaniciId,
                    Baslik = baslik,
                    Govde = govde,
                    Url = url,
                });
                await db.SaveChangesAsync(ct);
                return;
            }
        }

        // Yalnizca Web Push abone cihazlar (p256dh + auth dolu)
        var cihazlar = await db.KullaniciCihazlari
            .Where(c => c.KullaniciId == kullaniciId && c.PushP256dh != null && c.PushAuth != null)
            .ToListAsync(ct);
        if (cihazlar.Count == 0) return;

        var payload = JsonSerializer.Serialize(new
        {
            title = baslik,
            // Musa karari v19: marka satiri sabit "Planlama Defteri" (reklam gucu + marka stabilitesi; multitenant disi birakildi, degistirilemez)
            body = $"Planlama Defteri\n{govde}",
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

    // Turkiye saati (UTC+3) ile sessiz saat araliginda miyiz? Gece yarisi gecisini (orn 22:00-08:00) destekler.
    // public static: SessizSaatBosaltici da ayni mantigi kullanir (DRY, tek dogruluk kaynagi).
    public static bool SessizSaatteMi(TimeOnly baslangic, TimeOnly bitis)
    {
        var simdi = TimeOnly.FromDateTime(DateTime.UtcNow.AddHours(3));
        if (baslangic == bitis) return false;                              // ayni saat => sessiz saat yok
        if (baslangic < bitis) return simdi >= baslangic && simdi < bitis; // ayni gun (orn 09:00-17:00)
        return simdi >= baslangic || simdi < bitis;                        // gece yarisi gecisi (orn 22:00-08:00)
    }
}
