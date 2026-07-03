using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using Notlar.Api.Services;

namespace Notlar.Api.Background;

/// <summary>
/// v20 - Duyuru temizleyici. Duyurular gecici veridir; kalici iz YALNIZ audit'te.
/// Cift silme kosulu (spec):
///   (a) TAMAMLANDI: tum alicilar gordu VE konusma durdu (son aktiviteden >= 2 saat sessizlik;
///       son aktivite = son mesaj zamani, mesaj yoksa duyurunun olusturma zamani)
///   (b) TTL: olusturmadan >= 24 saat mutlak omur (tenant'a hic girmeyen uye riskini sifirlar)
/// Silme cascade'dir (duyuru -> alici + mesaj; v20 sema karari, tek DELETE) ve audit ile
/// AYNI SaveChanges icinde yazilir = atomik. Audit dogrudan DenetimGunlugu'na eklenir
/// (AnahtarSyncService deseni: HTTP context yok, aktor null = sistem) fakat IsletmeId
/// DOLU tutulur (tenant-scoped audit; sistem olayi tenant'in denetim ekraninda gorunur).
/// Iskelet: CopKutusuTemizleyici (BackgroundService + scope + try/catch dongu).
/// </summary>
public sealed class DuyuruTemizleyici : BackgroundService
{
    private readonly IServiceProvider _sp;
    private readonly ILogger<DuyuruTemizleyici> _log;
    private static readonly TimeSpan Periyod = TimeSpan.FromMinutes(15);
    private const int TtlSaat = 24;        // (b) mutlak omur - DuyuruEndpoints.TtlSaat ile ayni deger
    private const int SessizlikSaat = 2;   // (a) "konusma durdu" esigi (Musa karari, bu oturum)

    public DuyuruTemizleyici(IServiceProvider sp, ILogger<DuyuruTemizleyici> log)
    {
        _sp = sp; _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Ilk calistirma icin 90 sn bekle (app acilisini bloklamasin)
        try { await Task.Delay(TimeSpan.FromSeconds(90), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await TemizleAsync(stoppingToken); }
            catch (Exception ex) { _log.LogError(ex, "Duyuru temizlik dongusunde hata"); }

            try { await Task.Delay(Periyod, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task TemizleAsync(CancellationToken ct)
    {
        using var scope = _sp.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var yayinci = scope.ServiceProvider.GetRequiredService<IAkisYayinci>();

        var simdi = DateTimeOffset.UtcNow;
        var ttlEsik = simdi.AddHours(-TtlSaat);
        var sessizlikEsik = simdi.AddHours(-SessizlikSaat);

        // Adaylar tek sorguda: sebep bayragi + audit sayilari projeksiyonla.
        // (a) kosulu: gormemis alici YOK (Any !Goruldu == false) VE
        //     son aktivite (MAX mesaj zamani ?? olusturma) sessizlik esiginden eski.
        var adaylar = await db.Duyurular
            .Where(d =>
                d.OlusturmaZamani <= ttlEsik
                || (
                    !db.DuyuruAlicilari.Any(a => a.DuyuruId == d.Id && !a.Goruldu)
                    && ((db.DuyuruMesajlari.Where(m => m.DuyuruId == d.Id)
                            .Max(m => (DateTimeOffset?)m.OlusturmaZamani) ?? d.OlusturmaZamani) <= sessizlikEsik)
                ))
            .Select(d => new
            {
                d.Id,
                d.IsletmeId,
                TtlDoldu = d.OlusturmaZamani <= ttlEsik,
                AliciSayisi = db.DuyuruAlicilari.Count(a => a.DuyuruId == d.Id),
                GorenSayisi = db.DuyuruAlicilari.Count(a => a.DuyuruId == d.Id && a.Goruldu),
                MesajSayisi = db.DuyuruMesajlari.Count(m => m.DuyuruId == d.Id),
            })
            .ToListAsync(ct);

        if (adaylar.Count == 0) return;

        var idler = adaylar.Select(a => a.Id).ToList();
        var duyurular = await db.Duyurular.Where(d => idler.Contains(d.Id)).ToListAsync(ct);

        // Kalici iz: silinen her duyuru icin dogrudan audit kaydi (icerik TEKRAR yazilmaz;
        // kirpilmis iz zaten duyuru_paylasildi kaydinda - "kalici kayit yok" ruhuna sadik).
        foreach (var a in adaylar)
        {
            db.DenetimGunlukleri.Add(new DenetimGunlugu
            {
                IsletmeId = a.IsletmeId,
                Olay = "duyuru_silindi",
                HedefTip = "duyuru",
                HedefId = a.Id,
                AktorKullaniciId = null,   // sistem (background job)
                DegisenAlanlar = JsonSerializer.Serialize(new
                {
                    sebep = a.TtlDoldu ? "ttl" : "tamamlandi",
                    aliciSayisi = a.AliciSayisi,
                    gorenSayisi = a.GorenSayisi,
                    mesajSayisi = a.MesajSayisi,
                }),
                Detay = "Duyuru otomatik temizligi (DuyuruTemizleyici)",
            });
        }

        // Silme (alici + mesaj cascade) + audit TEK SaveChanges = atomik.
        db.Duyurular.RemoveRange(duyurular);
        await db.SaveChangesAsync(ct);

        // Canli yansima: acik ekranlardan dussun (frontend duyuru_silindi dinler; 15 sn polling yedek).
        foreach (var a in adaylar)
        {
            yayinci.Yayinla(new AkisOlayi(
                Olay: "duyuru_silindi", HedefTip: "duyuru", HedefId: a.Id, IsletmeId: a.IsletmeId,
                AktorEmail: null, AktorAdSoyad: null,
                Detay: null, DegisenAlanlar: null, Zaman: simdi));
        }

        _log.LogInformation(
            "Duyuru temizligi: {Sayi} duyuru silindi (ttl={Ttl}, tamamlandi={Tamam})",
            adaylar.Count, adaylar.Count(x => x.TtlDoldu), adaylar.Count(x => !x.TtlDoldu));
    }
}
