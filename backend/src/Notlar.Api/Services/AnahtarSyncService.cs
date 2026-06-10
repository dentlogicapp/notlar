using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using Notlar.Api.Models.Sema;

namespace Notlar.Api.Services;

// v18 Asama 11.9 - Schema-as-Code senkronizasyonu (startup).
// AnahtarKatalogu (kod) = tek dogruluk; metin_anahtarlari (DB) = turetilmis mirror.
// Idempotent: degisiklik yoksa hicbir sey yazmaz. HTTP context'siz calisir (startup),
// bu yuzden IAuditService yerine DenetimGunlugu'na dogrudan sistem-audit yazar.
public sealed class AnahtarSyncService
{
    private readonly AppDbContext _db;
    private readonly ILogger<AnahtarSyncService> _log;

    public AnahtarSyncService(AppDbContext db, ILogger<AnahtarSyncService> log)
    {
        _db = db;
        _log = log;
    }

    public async Task SenkronizeAsync(CancellationToken ct = default)
    {
        // B1 self-check: tum AnahtarKodu const'lari katalogda tanimli mi? (yazim/eksik tanim yakalama)
        var katalogSet = new HashSet<string>(
            AnahtarKatalogu.Tumu.Select(t => t.Anahtar), StringComparer.Ordinal);
        var eksikKod = AnahtarKodu.Tumu.Where(k => !katalogSet.Contains(k)).ToList();
        if (eksikKod.Count > 0)
            throw new InvalidOperationException(
                $"AnahtarKodu const'lari katalogda yok: {string.Join(", ", eksikKod)}. Sema ile senkron degil.");

        var mevcutlar = await _db.MetinAnahtarlari.ToListAsync(ct);
        var mevcutHarita = mevcutlar.ToDictionary(x => x.Anahtar, StringComparer.Ordinal);
        var katalogAnahtarlar = new HashSet<string>(
            AnahtarKatalogu.Tumu.Select(t => t.Anahtar), StringComparer.Ordinal);

        var eklenen = new List<string>();
        var guncellenen = new List<string>();
        var deprecateEdilen = new List<string>();

        // 1) Katalogdaki her tanim -> DB'de upsert
        foreach (var tanim in AnahtarKatalogu.Tumu)
        {
            var placeholderJson = JsonSerializer.Serialize(tanim.Placeholderlar);

            if (!mevcutHarita.TryGetValue(tanim.Anahtar, out var satir))
            {
                // YENI anahtar: tum alanlar kod'tan
                _db.MetinAnahtarlari.Add(new MetinAnahtari
                {
                    Anahtar = tanim.Anahtar,
                    Etiket = tanim.Etiket,
                    Yonlendirme = tanim.Yonlendirme,
                    Aciklama = tanim.Aciklama,
                    Tip = tanim.TipKodu,
                    Kategori = tanim.KategoriKodu,
                    Kapsam = tanim.KapsamKodu,
                    Zorunlu = tanim.Zorunlu,
                    DesteklenenPlaceholderlar = placeholderJson,
                    Sira = tanim.Sira,
                    Deprecated = tanim.Deprecated,
                    KarakterLimiti = tanim.KarakterLimiti,
                });
                eklenen.Add(tanim.Anahtar);
            }
            else
            {
                // MEVCUT anahtar: sema alanlari (Tip/Kategori/Placeholder/Zorunlu/Deprecated) kod kazanir.
                // Dokumantasyon (Etiket/Yonlendirme/Aciklama/Sira/KarakterLimiti) DB override korunur.
                var degisti = false;
                if (satir.Tip != tanim.TipKodu) { satir.Tip = tanim.TipKodu; degisti = true; }
                if (satir.Kategori != tanim.KategoriKodu) { satir.Kategori = tanim.KategoriKodu; degisti = true; }
                if (satir.Kapsam != tanim.KapsamKodu) { satir.Kapsam = tanim.KapsamKodu; degisti = true; }
                if (satir.DesteklenenPlaceholderlar != placeholderJson) { satir.DesteklenenPlaceholderlar = placeholderJson; degisti = true; }
                if (satir.Zorunlu != tanim.Zorunlu) { satir.Zorunlu = tanim.Zorunlu; degisti = true; }
                if (satir.Deprecated != tanim.Deprecated) { satir.Deprecated = tanim.Deprecated; degisti = true; }
                if (degisti)
                {
                    satir.GuncellemeZamani = DateTimeOffset.UtcNow;
                    guncellenen.Add(tanim.Anahtar);
                }
            }
        }

        // 2) Katalogda olmayan DB anahtarlari -> auto-deprecate (veri kaybi yok, silinmez)
        foreach (var satir in mevcutlar)
        {
            if (!katalogAnahtarlar.Contains(satir.Anahtar) && !satir.Deprecated)
            {
                satir.Deprecated = true;
                satir.GuncellemeZamani = DateTimeOffset.UtcNow;
                deprecateEdilen.Add(satir.Anahtar);
            }
        }

        // 3) Degisiklik yoksa: yazma yok (idempotent)
        if (eklenen.Count == 0 && guncellenen.Count == 0 && deprecateEdilen.Count == 0)
        {
            _log.LogInformation(
                "Anahtar senkronizasyonu: degisiklik yok ({Toplam} anahtar, surum {Surum}).",
                AnahtarKatalogu.Tumu.Count, AnahtarKatalogu.Version);
            return;
        }

        // 4) Sistem-audit: HTTP context yok -> DenetimGunlugu'na dogrudan (IsletmeId/Aktor null = sistem).
        //    Upsert + audit tek SaveChangesAsync ile atomik yazilir.
        _db.DenetimGunlukleri.Add(new DenetimGunlugu
        {
            IsletmeId = null,
            Olay = "sema_senkronizasyon",
            HedefTip = "metin_anahtari",
            HedefId = null,
            AktorKullaniciId = null,
            DegisenAlanlar = JsonSerializer.Serialize(new
            {
                surum = AnahtarKatalogu.Version,
                eklenen,
                guncellenen,
                deprecate_edilen = deprecateEdilen,
            }),
            Detay = $"Schema-as-Code senkronizasyonu (surum {AnahtarKatalogu.Version})",
        });
        await _db.SaveChangesAsync(ct);

        _log.LogInformation(
            "Anahtar senkronizasyonu tamam: +{Eklenen} eklenen, {Guncellenen} guncellenen, {Deprecate} deprecate ({Toplam} toplam, surum {Surum}).",
            eklenen.Count, guncellenen.Count, deprecateEdilen.Count, AnahtarKatalogu.Tumu.Count, AnahtarKatalogu.Version);
    }
}
