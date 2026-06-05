using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using Notlar.Api.Services;

namespace Notlar.Api.Background;

/// <summary>
/// Her 1 dakikada hatırlatması olan + henüz gönderilmemiş notları bulur,
/// kime/şekil değerlerine göre bildirim oluşturur ve/veya mail atar.
/// Idempotent: HatirlaticiGonderildiMi flag ile aynı not için tekrar gönderilmez.
/// </summary>
public sealed class HatirlaticiKontrolcusu : BackgroundService
{
    private readonly IServiceProvider _sp;
    private readonly ILogger<HatirlaticiKontrolcusu> _log;
    private static readonly TimeSpan Periyod = TimeSpan.FromMinutes(1);

    public HatirlaticiKontrolcusu(IServiceProvider sp, ILogger<HatirlaticiKontrolcusu> log)
    {
        _sp = sp; _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // İlk çalıştırma için 30 sn bekle (app açılışını bloklamasın)
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await KontrolEt(stoppingToken);
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Hatırlatıcı kontrol döngüsünde hata");
            }

            try { await Task.Delay(Periyod, stoppingToken); }
            catch (TaskCanceledException) { break; }
        }
    }

    private async Task KontrolEt(CancellationToken ct)
    {
        using var scope = _sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var email = scope.ServiceProvider.GetRequiredService<IEmailService>();

        var simdi = DateTimeOffset.UtcNow;

        // Zamanı gelmiş + gönderilmemiş + silinmemiş notlar
        var bekleyenler = await db.Notlar
            .Include(n => n.Klasor)
            .Include(n => n.OlusturanKullanici)
            .Where(n => n.HatirlatmaZamani != null
                     && !n.HatirlatmaGonderildiMi
                     && !n.Silindi
                     && n.HatirlatmaZamani <= simdi)
            .ToListAsync(ct);

        if (bekleyenler.Count == 0) return;

        _log.LogInformation("Hatırlatıcı kontrolcüsü: {Sayi} not işlenecek", bekleyenler.Count);

        // Bütün kullanıcıları tek seferde çek (alıcı belirlemek için)
        var kullanicilar = await db.Kullanicilar.ToListAsync(ct);

        foreach (var not in bekleyenler)
        {
            try
            {
                // Hedef kullanıcıları belirle
                var kuran = not.HatirlatmaKuranKullaniciId is null
                    ? not.OlusturanKullanici
                    : kullanicilar.FirstOrDefault(k => k.Id == not.HatirlatmaKuranKullaniciId.Value)
                        ?? not.OlusturanKullanici;

                var hedefler = HedefBul(kullanicilar, kuran, not.HatirlatmaKime ?? "bana");

                foreach (var hedef in hedefler)
                {
                    var kimeMetin = KimeMetinUret(hedef, kuran, not.HatirlatmaKime ?? "bana");

                    // Uygulama içi bildirim
                    if (not.HatirlatmaSekli == "uygulama" || not.HatirlatmaSekli == "her_ikisi")
                    {
                        db.Bildirimler.Add(new Bildirim
                        {
                            KullaniciId = hedef.Id,
                            IsletmeId = not.IsletmeId,  // v15 — bildirim notun tenant'ında düşer
                            Tip = "hatirlatma",
                            NotId = not.Id,
                            Baslik = "Hatırlatıcı",
                            Mesaj = $"\"{not.Baslik}\" notunun zamanı geldi"
                        });
                    }

                    // E-posta
                    if (not.HatirlatmaSekli == "email" || not.HatirlatmaSekli == "her_ikisi")
                    {
                        try
                        {
                            await email.HatirlaticiMailGonderAsync(
                                hedef.Email, hedef.AdSoyad,
                                not.Baslik, not.Icerik,
                                not.Klasor?.Ad,
                                kimeMetin,
                                not.HatirlatmaZamani!.Value,
                                not.Id,
                                not.IsletmeId,
                                ct);
                        }
                        catch (Exception mailEx)
                        {
                            _log.LogError(mailEx, "Hatırlatma maili gönderilemedi: {Email} / Not {NotId}",
                                hedef.Email, not.Id);
                            // Mail başarısız olsa bile diğer hedefler için devam
                        }
                    }
                }

                // Idempotent flag
                not.HatirlatmaGonderildiMi = true;
                not.HatirlatmaGonderimZamani = simdi;
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Hatırlatıcı işlenirken hata: Not {NotId}", not.Id);
            }
        }

        await db.SaveChangesAsync(ct);

        _log.LogInformation("Hatırlatıcı kontrolcüsü: {Sayi} not işlendi", bekleyenler.Count);
    }

    private static IReadOnlyList<Kullanici> HedefBul(IReadOnlyList<Kullanici> tumu, Kullanici kuran, string kime)
    {
        return kime switch
        {
            "bana" => new[] { kuran },
            "askima" => tumu.Where(k => k.Id != kuran.Id && k.Aktif).ToArray(),
            "ikimize" => tumu.Where(k => k.Aktif).ToArray(),
            _ => new[] { kuran }
        };
    }

    private static string KimeMetinUret(Kullanici hedef, Kullanici kuran, string kime)
    {
        // 4 doğru varyant (kuran perspektifi: "Sen" | "Aşkın")
        var hedefKurdu = hedef.Id == kuran.Id;
        var ikimize = kime == "ikimize";

        if (hedefKurdu && !ikimize) return "Sen kurdun · Sana hatırlatıldı";
        if (hedefKurdu && ikimize)  return "Sen kurdun · Aşkına ve sana hatırlatıldı";
        if (!hedefKurdu && !ikimize) return "Aşkın kurdu · Sana hatırlatıldı";
        return "Aşkın kurdu · Aşkına ve sana hatırlatıldı";
    }
}
