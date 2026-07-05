using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using Notlar.Api.Models.Sema;

namespace Notlar.Api.Services;

/// <summary>
/// v19 4c - Not yasam dongusu olaylarinda (olustur/guncelle/tamamla/alici eklendi)
/// ve uye katiliminda tenant uyelerine Web Push tetikler.
/// Metin tenant ozel anahtardan (yoksa katalog varsayilani) okunur, yer tutucular doldurulur.
/// Marka satiri ("Planlama Defteri") PushGonderici'de sabit eklenir (burada degil).
/// Tum bildirimlerde tiklama url'i /?focus={notId} -> frontend ring highlight (mail ile ayni).
/// "Kim alir": olayi yapan (aktor) haric tenant uyeleri. Yeni hatirlatici alicilari
/// olustur/guncelle bildiriminden muaf tutulur (haricEkstra), onlara sadece "eklendin" gider.
/// </summary>
public interface INotBildirimServisi
{
    Task NotOlusturuldu(Not not, Guid aktorId, IReadOnlyCollection<Guid>? muafAliciIdler, CancellationToken ct = default);
    Task NotGuncellendi(Not not, Guid aktorId, IReadOnlyCollection<Guid>? muafAliciIdler, CancellationToken ct = default);
    Task NotTamamlandi(Not not, Guid aktorId, CancellationToken ct = default);
    Task HatirlaticiAliciEklendi(Not not, Guid aktorId, IReadOnlyCollection<Guid> yeniAliciIdler, CancellationToken ct = default);
    Task UyeKatildi(Guid isletmeId, Kullanici yeniUye, CancellationToken ct = default);
    Task HatirlaticiZamani(Not not, IReadOnlyCollection<Guid> hedefler, CancellationToken ct = default);
    Task TestGonder(Guid isletmeId, Guid adminId, string olay, CancellationToken ct = default);
    // v20 - Duyuru Paylasimi bildirimleri
    Task DuyuruPaylasildi(Duyuru duyuru, IReadOnlyCollection<Guid> aliciIdler, CancellationToken ct = default);
    Task DuyuruYanitlandi(Duyuru duyuru, Guid gonderenId, IReadOnlyCollection<Guid> hedefler, CancellationToken ct = default);
    // v21 M1 + Talep-1
    Task<List<Guid>> BahsedilenleriCoz(Guid isletmeId, string metin, CancellationToken ct = default);
    Task NotBahsedildi(Not not, Guid aktorId, IReadOnlyCollection<Guid> hedefler, CancellationToken ct = default);
    Task NotSilindi(Not not, Guid aktorId, CancellationToken ct = default);
    Task NotYenidenAcildi(Not not, Guid aktorId, CancellationToken ct = default);
    Task NotGeriYuklendi(Not not, Guid aktorId, CancellationToken ct = default);
    Task NotKaliciSilindi(Not not, Guid aktorId, CancellationToken ct = default);
    Task KlasorOlayi(Klasor klasor, Guid aktorId, bool silindiMi, CancellationToken ct = default);
}

public sealed class NotBildirimServisi : INotBildirimServisi
{
    private readonly AppDbContext _db;
    private readonly IPushGonderici _push;
    private readonly IIsletmeMetinService _metin;
    private readonly ILogger<NotBildirimServisi> _log;

    public NotBildirimServisi(AppDbContext db, IPushGonderici push, IIsletmeMetinService metin, ILogger<NotBildirimServisi> log)
    {
        _db = db; _push = push; _metin = metin; _log = log;
    }

    // Tenant ozel deger -> yoksa katalog varsayilani (Sifir Sablon: katalog tek dogruluk kaynagi)
    private async Task<(string baslik, string govde)> MetinAl(
        Guid isletmeId, string anahtarBaslik, string anahtarGovde, CancellationToken ct)
    {
        var baslik = (await _metin.GetirAsync(isletmeId, anahtarBaslik, ct))?.Icerik
                     ?? KatalogVarsayilan(anahtarBaslik);
        var govde = (await _metin.GetirAsync(isletmeId, anahtarGovde, ct))?.Icerik
                    ?? KatalogVarsayilan(anahtarGovde);
        return (baslik, govde);
    }

    private static string KatalogVarsayilan(string anahtar)
        => AnahtarKatalogu.Tumu.FirstOrDefault(a => a.Anahtar == anahtar)?.Varsayilan ?? "";

    private static string Doldur(string metin, string? notBaslik, string? kullaniciAdi, string? klasorAdi = null)  // v21 - klasorAdi default'lu (sifir kirilim)
        => metin.Replace("{not_baslik}", Kirp(notBaslik, 40))
                .Replace("{kullanici_adi}", Kirp(kullaniciAdi, 30))
                .Replace("{klasor_adi}", Kirp(klasorAdi, 40));  // v21 - klasor olaylari

    // Bildirim ekranina sigsin diye yer tutucu degerlerini kirpar (sonu "..." ile);
    // boylece sabit kuyruk ("... tikla!") her zaman gorunur kalir.
    private static string Kirp(string? s, int max)
    {
        if (string.IsNullOrEmpty(s)) return "";
        s = s.Trim();
        return s.Length <= max ? s : s.Substring(0, max).TrimEnd() + "…";
    }

    private Task<string> AktorAd(Guid aktorId, CancellationToken ct)
        => _db.Kullanicilar.Where(k => k.Id == aktorId)
            .Select(k => k.AdSoyad).FirstOrDefaultAsync(ct)!;

    // Tenant'in aktif uyeleri (aktor + muaf alicilar haric)
    private Task<List<Guid>> HedefUyeler(Guid isletmeId, Guid aktorId, IReadOnlyCollection<Guid>? muaf, CancellationToken ct)
    {
        var haric = new HashSet<Guid>(muaf ?? Array.Empty<Guid>()) { aktorId };
        return _db.IsletmeUyelikleri
            .Where(u => u.IsletmeId == isletmeId && u.Aktif && !haric.Contains(u.KullaniciId))
            .Select(u => u.KullaniciId)
            .ToListAsync(ct);
    }

    // Cift kanal bildirim: (1) uygulama ici (in-app) kalici kayit; push aboneliginden bagimsiz,
    // sessiz saatte bile yazilir, kullanici avatar ikonunda gorur. (2) Web Push; anlik ekstra, best-effort.
    // Push hic gelmese bile in-app kaydi garanti. Tek kanala guvenmek kirilgan, cift kanal dayanikli.
    private async Task Tetikle(IEnumerable<Guid> hedefler, string baslik, string govde, string? url,
        Guid isletmeId, string tip, Guid? notId, CancellationToken ct, bool sessizSaateTabi = true, string? uygulamaIciMesaj = null)  // v20.2 K3 - zil metni push'tan ayri olabilir
    {
        var hedefList = hedefler.ToList();
        if (hedefList.Count == 0) return;

        // (1) In-app: her hedefe kalici Bildirim kaydi (zil). Push durumundan bagimsiz, sessiz saatte de yazilir.
        foreach (var uid in hedefList)
        {
            _db.Bildirimler.Add(new Bildirim
            {
                KullaniciId = uid,
                IsletmeId = isletmeId,
                Tip = tip,
                NotId = notId,
                Baslik = baslik,
                Mesaj = uygulamaIciMesaj ?? govde,  // v20.2 K3
            });
        }
        await _db.SaveChangesAsync(ct);

        // (1b) Tavan koru: her hedefte tenant basina en fazla 15 bildirim kalir; fazlasi (en eskiler) DB'den silinir.
        foreach (var uid in hedefList)
        {
            var fazlalar = await _db.Bildirimler
                .Where(b => b.KullaniciId == uid && b.IsletmeId == isletmeId)
                .OrderByDescending(b => b.OlusturmaZamani)
                .Skip(15)
                .ToListAsync(ct);
            if (fazlalar.Count > 0)
            {
                _db.Bildirimler.RemoveRange(fazlalar);
                await _db.SaveChangesAsync(ct);
            }
        }

        // (2) Web Push: best-effort. Gelmese bile yukaridaki in-app kaydi durur.
        foreach (var uid in hedefList)
        {
            try { await _push.GonderAsync(uid, baslik, govde, url, sessizSaateTabi, ct); }
            catch (Exception ex) { _log.LogError(ex, "Not bildirimi push gonderilemedi: Hedef {Uid}", uid); }
        }
    }

    private async Task NotOlayi(Not not, Guid aktorId, IReadOnlyCollection<Guid>? muaf,
        string anahtarBaslik, string anahtarGovde, string url, string tip, CancellationToken ct)
    {
        var hedefler = await HedefUyeler(not.IsletmeId, aktorId, muaf, ct);
        if (hedefler.Count == 0) return;
        var (b, g) = await MetinAl(not.IsletmeId, anahtarBaslik, anahtarGovde, ct);
        var ad = await AktorAd(aktorId, ct);
        b = Doldur(b, not.Baslik, ad); g = Doldur(g, not.Baslik, ad);
        await Tetikle(hedefler, b, g, url, not.IsletmeId, tip, not.Id, ct);
    }

    // Bekleyen not ana listede gorunur -> ana sayfa; tamamlanan not "Tamamlananlar" klasorune
    // tasindigi icin -> o klasore yonlendirilir (ikisinde de ?focus={id} -> scroll + highlight).
    private static string AnaUrl(Not not) => $"/?focus={not.Id}";
    private static string KlasorUrl(Not not)
        => not.KlasorId is Guid kid ? $"/klasor/{kid}?focus={not.Id}" : AnaUrl(not);

    public Task NotOlusturuldu(Not not, Guid aktorId, IReadOnlyCollection<Guid>? muafAliciIdler, CancellationToken ct = default)
        => NotOlayi(not, aktorId, muafAliciIdler, "not_olusturuldu_push_baslik", "not_olusturuldu_push_govde", AnaUrl(not), "not_olusturuldu", ct);

    public Task NotGuncellendi(Not not, Guid aktorId, IReadOnlyCollection<Guid>? muafAliciIdler, CancellationToken ct = default)
        => NotOlayi(not, aktorId, muafAliciIdler, "not_guncellendi_push_baslik", "not_guncellendi_push_govde", AnaUrl(not), "not_guncellendi", ct);

    public Task NotTamamlandi(Not not, Guid aktorId, CancellationToken ct = default)
        => NotOlayi(not, aktorId, null, "not_tamamlandi_push_baslik", "not_tamamlandi_push_govde", KlasorUrl(not), "not_tamamlandi", ct);

    public async Task HatirlaticiAliciEklendi(Not not, Guid aktorId, IReadOnlyCollection<Guid> yeniAliciIdler, CancellationToken ct = default)
    {
        // Sadece YENI eklenen aliciler (aktor kendini eklediyse ona gitmez)
        var hedefler = yeniAliciIdler.Where(id => id != aktorId).Distinct().ToList();
        if (hedefler.Count == 0) return;
        var (b, g) = await MetinAl(not.IsletmeId, "hatirlatici_alici_eklendi_push_baslik", "hatirlatici_alici_eklendi_push_govde", ct);
        var ad = await AktorAd(aktorId, ct);
        b = Doldur(b, not.Baslik, ad); g = Doldur(g, not.Baslik, ad);
        await Tetikle(hedefler, b, g, $"/?focus={not.Id}", not.IsletmeId, "hatirlatici_eklendi", not.Id, ct);
    }

    public async Task UyeKatildi(Guid isletmeId, Kullanici yeniUye, CancellationToken ct = default)
    {
        var hedefler = await HedefUyeler(isletmeId, yeniUye.Id, null, ct);
        if (hedefler.Count == 0) return;
        var (b, g) = await MetinAl(isletmeId, "uye_katildi_push_baslik", "uye_katildi_push_govde", ct);
        // {kullanici_adi} = katilan uye; {not_baslik} bu olayda yok; tiklamada ana sayfa
        b = Doldur(b, null, yeniUye.AdSoyad); g = Doldur(g, null, yeniUye.AdSoyad);
        await Tetikle(hedefler, b, g, "/", isletmeId, "uye_katildi", null, ct);
    }

    public async Task HatirlaticiZamani(Not not, IReadOnlyCollection<Guid> hedefler, CancellationToken ct = default)
    {
        var liste = hedefler.Distinct().ToList();
        if (liste.Count == 0) return;
        var (b, g) = await MetinAl(not.IsletmeId, "hatirlatici_push_baslik", "hatirlatici_push_govde", ct);
        b = Doldur(b, not.Baslik, null); g = Doldur(g, not.Baslik, null);
        // Hatirlatici MUAF: sessiz saatte bile aninda gider (kullanici o ana hatirlatici kurmus).
        await Tetikle(liste, b, g, $"/?focus={not.Id}", not.IsletmeId, "hatirlatma", not.Id, ct, sessizSaateTabi: false);
    }

    // Test bildirimi: secili olayin metnini ornek placeholder degerleriyle admin'in kendi cihazina gonderir.
    // Gercek bildirimle ayni MetinAl + Doldur yolundan gecer (sapma yok). Sessiz saate takilmaz; aninda gelir.
    public async Task TestGonder(Guid isletmeId, Guid adminId, string olay, CancellationToken ct = default)
    {
        var (b, g) = await MetinAl(isletmeId, $"{olay}_push_baslik", $"{olay}_push_govde", ct);
        b = Doldur(b, "Örnek Not", "Bir üye");
        g = Doldur(g, "Örnek Not", "Bir üye");
        await _push.GonderAsync(adminId, b, g, "/", false, ct);
    }

    // v20 - Duyuru paylasildi: alicilara cift kanal bildirim (in-app + Web Push).
    // Push metni tenant anahtarindan (duyuru_push_baslik/govde); PUSH'ta yonetici adi ifsa edilmez
    // (kilit ekrani gizliligi). v20.2 K3 (madde 4): UYGULAMA ICI (zil) metni ayri anahtardan, {kullanici_adi} dolu.
    public async Task DuyuruPaylasildi(Duyuru duyuru, IReadOnlyCollection<Guid> aliciIdler, CancellationToken ct = default)
    {
        var hedefler = aliciIdler.Where(x => x != duyuru.OlusturanKullaniciId).Distinct().ToList();
        if (hedefler.Count == 0) return;
        var (b, g) = await MetinAl(duyuru.IsletmeId, "duyuru_push_baslik", "duyuru_push_govde", ct);
        b = Doldur(b, null, null); g = Doldur(g, null, null);
        // v20.2 K3 - zil (in-app) metni: {kullanici_adi} = duyuruyu paylasan yonetici (madde 4)
        var (_, uygulamaIci) = await MetinAl(duyuru.IsletmeId, "duyuru_push_baslik", "duyuru_uygulama_ici_govde", ct);
        uygulamaIci = Doldur(uygulamaIci, null, await AktorAd(duyuru.OlusturanKullaniciId, ct));
        await Tetikle(hedefler, b, g, $"/?duyuru={duyuru.Id}", duyuru.IsletmeId, "duyuru", duyuru.Id, ct, uygulamaIciMesaj: uygulamaIci);  // NotId = duyuru id (Tip ayristirici; zil tiklamasi hedefi)
    }

    // v20 - Duyuru konusmasina yanit: karsi tarafa push ({kullanici_adi} = yaniti yazan).
    public async Task DuyuruYanitlandi(Duyuru duyuru, Guid gonderenId, IReadOnlyCollection<Guid> hedefler, CancellationToken ct = default)
    {
        var liste = hedefler.Where(x => x != gonderenId).Distinct().ToList();
        if (liste.Count == 0) return;
        var (b, g) = await MetinAl(duyuru.IsletmeId, "duyuru_yanit_push_baslik", "duyuru_yanit_push_govde", ct);
        var ad = await AktorAd(gonderenId, ct);
        b = Doldur(b, null, ad); g = Doldur(g, null, ad);
        await Tetikle(liste, b, g, $"/?duyuru={duyuru.Id}", duyuru.IsletmeId, "duyuru_yanit", duyuru.Id, ct);  // NotId = duyuru id (Tip ayristirici; zil tiklamasi hedefi)
    }

    // ================= v21 M1 + Talep-1: mention + yasam dongusu bildirimleri =================
    // Hepsi mevcut desenle BIREBIR: HedefUyeler -> MetinAl -> Doldur -> Tetikle.

    // v21 M1 - metindeki "@Ad Soyad" gecislerini tenant AKTIF uyeleriyle esler.
    // Ordinal karsilastirma: frontend picker TAM adi gomer; elle yazim sahte-pozitifi olmaz.
    public async Task<List<Guid>> BahsedilenleriCoz(Guid isletmeId, string metin, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(metin) || !metin.Contains('@')) return new List<Guid>();
        var uyeler = await _db.IsletmeUyelikleri
            .Where(u => u.IsletmeId == isletmeId && u.Aktif)
            .Join(_db.Kullanicilar, u => u.KullaniciId, k => k.Id, (u, k) => new { k.Id, k.AdSoyad })
            .ToListAsync(ct);
        return uyeler
            .Where(u => !string.IsNullOrWhiteSpace(u.AdSoyad) && metin.Contains("@" + u.AdSoyad, StringComparison.Ordinal))
            .Select(u => u.Id).Distinct().ToList();
    }

    // v21 M1 - "bahsedildin": tip "bahsedildi" (B3 rozeti bu tipten turetilir);
    // tiklama hedefi notun bulundugu yer (bekleyen -> ana sayfa, tamamlanan -> klasor).
    public async Task NotBahsedildi(Not not, Guid aktorId, IReadOnlyCollection<Guid> hedefler, CancellationToken ct = default)
    {
        var liste = hedefler.Where(x => x != aktorId).Distinct().ToList();
        if (liste.Count == 0) return;
        var (b, g) = await MetinAl(not.IsletmeId, "not_bahsedildi_push_baslik", "not_bahsedildi_push_govde", ct);
        var ad = await AktorAd(aktorId, ct);
        b = Doldur(b, not.Baslik, ad); g = Doldur(g, not.Baslik, ad);
        await Tetikle(liste, b, g, not.Tamamlandi ? KlasorUrl(not) : AnaUrl(not), not.IsletmeId, "bahsedildi", not.Id, ct);
    }

    // Talep-1 (v21) - yasam dongusu olaylari (tek satirlik NotOlayi delegasyonu)
    public Task NotSilindi(Not not, Guid aktorId, CancellationToken ct = default)
        => NotOlayi(not, aktorId, null, "not_silindi_push_baslik", "not_silindi_push_govde", AnaUrl(not), "not_silindi", ct);

    public Task NotYenidenAcildi(Not not, Guid aktorId, CancellationToken ct = default)
        => NotOlayi(not, aktorId, null, "not_yeniden_acildi_push_baslik", "not_yeniden_acildi_push_govde", AnaUrl(not), "not_yeniden_acildi", ct);

    public Task NotGeriYuklendi(Not not, Guid aktorId, CancellationToken ct = default)
        => NotOlayi(not, aktorId, null, "not_geri_yuklendi_push_baslik", "not_geri_yuklendi_push_govde", AnaUrl(not), "not_geri_yuklendi", ct);

    public Task NotKaliciSilindi(Not not, Guid aktorId, CancellationToken ct = default)
        => NotOlayi(not, aktorId, null, "not_kalici_silindi_push_baslik", "not_kalici_silindi_push_govde", AnaUrl(not), "not_kalici_silindi", ct);

    // Talep-1 (v21) - klasor olaylari ({klasor_adi}; cagrilar KlasorEndpoints'te - A2b)
    public async Task KlasorOlayi(Klasor klasor, Guid aktorId, bool silindiMi, CancellationToken ct = default)
    {
        var hedefler = await HedefUyeler(klasor.IsletmeId, aktorId, null, ct);
        if (hedefler.Count == 0) return;
        var on = silindiMi ? "klasor_silindi" : "klasor_olusturuldu";
        var (b, g) = await MetinAl(klasor.IsletmeId, $"{on}_push_baslik", $"{on}_push_govde", ct);
        var ad = await AktorAd(aktorId, ct);
        b = Doldur(b, null, ad, klasor.Ad); g = Doldur(g, null, ad, klasor.Ad);
        await Tetikle(hedefler, b, g, silindiMi ? "/" : $"/klasor/{klasor.Id}", klasor.IsletmeId, on, klasor.Id, ct);  // v21-r M2 - NotId=klasor id (duyuru deseni; FE tiklamada hedefler)
    }
}
