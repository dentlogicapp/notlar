using Microsoft.EntityFrameworkCore;
using System.Text.Json;
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
        var push = scope.ServiceProvider.GetRequiredService<IPushGonderici>();

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

                var hedefler = HedefBul(kullanicilar, kuran, not);

                foreach (var hedef in hedefler)
                {
                    // Uygulama ici bildirim (zil) - her zaman korunur
                    db.Bildirimler.Add(new Bildirim
                    {
                        KullaniciId = hedef.Id,
                        IsletmeId = not.IsletmeId,  // v15 — bildirim notun tenant'ında düşer
                        Tip = "hatirlatma",
                        NotId = not.Id,
                        Baslik = "Hatırlatıcı",
                        Mesaj = $"\"{not.Baslik}\" notunun zamanı geldi"
                    });

                    // Web Push (gercek telefon bildirimi) - v19: hatirlatici maili kaldirildi
                    try
                    {
                        await push.GonderAsync(
                            hedef.Id,
                            "Hatırlatıcı",
                            $"\"{not.Baslik}\" notunun zamanı geldi",
                            $"/?focus={not.Id}",
                            ct);
                    }
                    catch (Exception pushEx)
                    {
                        _log.LogError(pushEx, "Hatırlatma push gönderilemedi: Not {NotId} / Hedef {HedefId}", not.Id, hedef.Id);
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

    private static IReadOnlyList<Kullanici> HedefBul(IReadOnlyList<Kullanici> tumu, Kullanici kuran, Not not)
    {
        // v19 P4 - yeni: secili uye id listesi (uuid[]). POST/PUT'ta tenant uyesi dogrulandi.
        if (!string.IsNullOrWhiteSpace(not.HatirlatmaAliciIdler))
        {
            var idler = JsonSerializer.Deserialize<List<Guid>>(not.HatirlatmaAliciIdler) ?? new List<Guid>();
            return tumu.Where(k => idler.Contains(k.Id) && k.Aktif).ToArray();
        }
        // Geriye uyum: migration oncesi eski string model ("askima"/"bana"/"ikimize")
        return (not.HatirlatmaKime ?? "bana") switch
        {
            "bana" => new[] { kuran },
            "askima" => tumu.Where(k => k.Id != kuran.Id && k.Aktif).ToArray(),
            "ikimize" => tumu.Where(k => k.Aktif).ToArray(),
            _ => new[] { kuran }
        };
    }

    private static string KimeMetinUret(IReadOnlyList<Kullanici> hedefler, Kullanici kuran)
    {
        // v19 - canli: kuran + TUM alici isimleri (kisa ad). Ornek: "Musa D. hatirlaticiyi kurdu, Musa D., Hasan K.'e hatirlatildi".
        var alicilar = string.Join(", ", hedefler.Select(h => KisaAd(h.AdSoyad)));
        return $"{KisaAd(kuran.AdSoyad)} hatırlatıcıyı kurdu · {alicilar}'e hatırlatıldı";
    }

    // "Musa Deveci" -> "Musa D." | "Mehmet Ali Kaya" -> "Mehmet Ali K." | "Hasan" -> "Hasan"
    private static string KisaAd(string adSoyad)
    {
        var p = (adSoyad ?? "").Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (p.Length == 0) return "";
        if (p.Length == 1) return p[0];
        return $"{string.Join(" ", p[..^1])} {char.ToUpper(p[^1][0])}.";
    }
}
