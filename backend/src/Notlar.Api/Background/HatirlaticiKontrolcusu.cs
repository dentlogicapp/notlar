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
        var bildirimSvc = scope.ServiceProvider.GetRequiredService<INotBildirimServisi>();

        var simdi = DateTimeOffset.UtcNow;
        var kullanicilar = await db.Kullanicilar.ToListAsync(ct);
        bool degisiklikVar = false;

        // ===== 1) ERKEN ANIMSATICI (v21 M8) - asil zamandan once ikinci bildirim =====
        // Erken dakika dolu + henuz erken gonderilmemis + asil gonderilmemis + silinmemis.
        var erkenBekleyenler = await db.Notlar
            .Include(n => n.Klasor).Include(n => n.OlusturanKullanici)
            .Where(n => n.HatirlatmaZamani != null
                     && n.HatirlatmaErkenDakika != null
                     && !n.ErkenGonderildiMi
                     && !n.HatirlatmaGonderildiMi
                     && !n.Silindi)
            .ToListAsync(ct);

        foreach (var not in erkenBekleyenler)
        {
            // Erken ani = asil zaman - erken dakika. Henuz gelmediyse atla.
            var erkenAn = not.HatirlatmaZamani!.Value.AddMinutes(-not.HatirlatmaErkenDakika!.Value);
            if (erkenAn > simdi) continue;
            try
            {
                var kuran = KuranBul(kullanicilar, not);
                var hedefler = HedefBul(kullanicilar, kuran, not);
                await bildirimSvc.HatirlaticiZamani(not, hedefler.Select(h => h.Id).ToList(), ct);
                not.ErkenGonderildiMi = true;
                degisiklikVar = true;
            }
            catch (Exception ex) { _log.LogError(ex, "Erken animsatici hatasi: Not {NotId}", not.Id); }
        }

        // ===== 2) ASIL HATIRLATICI (+ tekrar, v21 M8) =====
        var bekleyenler = await db.Notlar
            .Include(n => n.Klasor).Include(n => n.OlusturanKullanici)
            .Where(n => n.HatirlatmaZamani != null
                     && !n.HatirlatmaGonderildiMi
                     && !n.Silindi
                     && n.HatirlatmaZamani <= simdi)
            .ToListAsync(ct);

        if (bekleyenler.Count > 0)
        {
            _log.LogInformation("Hatirlatici kontrolcusu: {Sayi} not islenecek", bekleyenler.Count);
            foreach (var not in bekleyenler)
            {
                try
                {
                    var kuran = KuranBul(kullanicilar, not);
                    var hedefler = HedefBul(kullanicilar, kuran, not);
                    await bildirimSvc.HatirlaticiZamani(not, hedefler.Select(h => h.Id).ToList(), ct);

                    // Tekrar mantigi: tekrar varsa zamani ileri al + flaglari sifirla (yeni dongu);
                    // bitis tarihini asiyorsa dur (gonderildi=true). Erken flag da sifirlanir -> her
                    // tekrarda erken animsatici yeniden tetiklenir (iOS davranisi).
                    var sonraki = SonrakiTekrarZamani(not.HatirlatmaZamani!.Value, not.HatirlatmaTekrar);
                    if (sonraki is DateTimeOffset s
                        && (not.HatirlatmaTekrarBitis is null || s <= not.HatirlatmaTekrarBitis.Value))
                    {
                        not.HatirlatmaZamani = s;
                        not.HatirlatmaGonderildiMi = false;
                        not.ErkenGonderildiMi = false;
                        not.HatirlatmaGonderimZamani = simdi;
                    }
                    else
                    {
                        not.HatirlatmaGonderildiMi = true;
                        not.HatirlatmaGonderimZamani = simdi;
                    }
                    degisiklikVar = true;
                }
                catch (Exception ex) { _log.LogError(ex, "Hatirlatici islenirken hata: Not {NotId}", not.Id); }
            }
        }

        if (degisiklikVar)
        {
            await db.SaveChangesAsync(ct);
            _log.LogInformation("Hatirlatici kontrolcusu: erken={Erken} asil={Asil} islendi",
                erkenBekleyenler.Count, bekleyenler.Count);
        }
    }

    // Hatirlaticiyi kuran kullaniciyi bul (kuran yoksa olusturan).
    private static Kullanici KuranBul(IReadOnlyList<Kullanici> kullanicilar, Not not)
        => not.HatirlatmaKuranKullaniciId is null
            ? not.OlusturanKullanici
            : kullanicilar.FirstOrDefault(k => k.Id == not.HatirlatmaKuranKullaniciId.Value) ?? not.OlusturanKullanici;

    // Sonraki tekrar zamani (null = tekrar yok/gecersiz -> dur). iOS standart set.
    private static DateTimeOffset? SonrakiTekrarZamani(DateTimeOffset mevcut, string? tekrar)
        => tekrar switch
        {
            "gunluk" => mevcut.AddDays(1),
            "haftalik" => mevcut.AddDays(7),
            "iki_haftalik" => mevcut.AddDays(14),
            "aylik" => mevcut.AddMonths(1),
            "yillik" => mevcut.AddYears(1),
            _ => null
        };

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
