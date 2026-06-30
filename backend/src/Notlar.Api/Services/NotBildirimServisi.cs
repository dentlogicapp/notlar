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

    private static string Doldur(string metin, string? notBaslik, string? kullaniciAdi)
        => metin.Replace("{not_baslik}", Kirp(notBaslik, 40))
                .Replace("{kullanici_adi}", Kirp(kullaniciAdi, 30));

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

    private async Task Tetikle(IEnumerable<Guid> hedefler, string baslik, string govde, string? url, CancellationToken ct, bool sessizSaateTabi = true)
    {
        foreach (var uid in hedefler)
        {
            try { await _push.GonderAsync(uid, baslik, govde, url, sessizSaateTabi, ct); }
            catch (Exception ex) { _log.LogError(ex, "Not bildirimi push gonderilemedi: Hedef {Uid}", uid); }
        }
    }

    private async Task NotOlayi(Not not, Guid aktorId, IReadOnlyCollection<Guid>? muaf,
        string anahtarBaslik, string anahtarGovde, string url, CancellationToken ct)
    {
        var hedefler = await HedefUyeler(not.IsletmeId, aktorId, muaf, ct);
        if (hedefler.Count == 0) return;
        var (b, g) = await MetinAl(not.IsletmeId, anahtarBaslik, anahtarGovde, ct);
        var ad = await AktorAd(aktorId, ct);
        b = Doldur(b, not.Baslik, ad); g = Doldur(g, not.Baslik, ad);
        await Tetikle(hedefler, b, g, url, ct);
    }

    // Bekleyen not ana listede gorunur -> ana sayfa; tamamlanan not "Tamamlananlar" klasorune
    // tasindigi icin -> o klasore yonlendirilir (ikisinde de ?focus={id} -> scroll + highlight).
    private static string AnaUrl(Not not) => $"/?focus={not.Id}";
    private static string KlasorUrl(Not not)
        => not.KlasorId is Guid kid ? $"/klasor/{kid}?focus={not.Id}" : AnaUrl(not);

    public Task NotOlusturuldu(Not not, Guid aktorId, IReadOnlyCollection<Guid>? muafAliciIdler, CancellationToken ct = default)
        => NotOlayi(not, aktorId, muafAliciIdler, "not_olusturuldu_push_baslik", "not_olusturuldu_push_govde", AnaUrl(not), ct);

    public Task NotGuncellendi(Not not, Guid aktorId, IReadOnlyCollection<Guid>? muafAliciIdler, CancellationToken ct = default)
        => NotOlayi(not, aktorId, muafAliciIdler, "not_guncellendi_push_baslik", "not_guncellendi_push_govde", AnaUrl(not), ct);

    public Task NotTamamlandi(Not not, Guid aktorId, CancellationToken ct = default)
        => NotOlayi(not, aktorId, null, "not_tamamlandi_push_baslik", "not_tamamlandi_push_govde", KlasorUrl(not), ct);

    public async Task HatirlaticiAliciEklendi(Not not, Guid aktorId, IReadOnlyCollection<Guid> yeniAliciIdler, CancellationToken ct = default)
    {
        // Sadece YENI eklenen aliciler (aktor kendini eklediyse ona gitmez)
        var hedefler = yeniAliciIdler.Where(id => id != aktorId).Distinct().ToList();
        if (hedefler.Count == 0) return;
        var (b, g) = await MetinAl(not.IsletmeId, "hatirlatici_alici_eklendi_push_baslik", "hatirlatici_alici_eklendi_push_govde", ct);
        var ad = await AktorAd(aktorId, ct);
        b = Doldur(b, not.Baslik, ad); g = Doldur(g, not.Baslik, ad);
        await Tetikle(hedefler, b, g, $"/?focus={not.Id}", ct);
    }

    public async Task UyeKatildi(Guid isletmeId, Kullanici yeniUye, CancellationToken ct = default)
    {
        var hedefler = await HedefUyeler(isletmeId, yeniUye.Id, null, ct);
        if (hedefler.Count == 0) return;
        var (b, g) = await MetinAl(isletmeId, "uye_katildi_push_baslik", "uye_katildi_push_govde", ct);
        // {kullanici_adi} = katilan uye; {not_baslik} bu olayda yok; tiklamada ana sayfa
        b = Doldur(b, null, yeniUye.AdSoyad); g = Doldur(g, null, yeniUye.AdSoyad);
        await Tetikle(hedefler, b, g, "/", ct);
    }

    public async Task HatirlaticiZamani(Not not, IReadOnlyCollection<Guid> hedefler, CancellationToken ct = default)
    {
        var liste = hedefler.Distinct().ToList();
        if (liste.Count == 0) return;
        var (b, g) = await MetinAl(not.IsletmeId, "hatirlatici_push_baslik", "hatirlatici_push_govde", ct);
        b = Doldur(b, not.Baslik, null); g = Doldur(g, not.Baslik, null);
        // Hatirlatici MUAF: sessiz saatte bile aninda gider (kullanici o ana hatirlatici kurmus).
        await Tetikle(liste, b, g, $"/?focus={not.Id}", ct, sessizSaateTabi: false);
    }
}
