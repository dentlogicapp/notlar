using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

// v20 - Duyuru Paylasimi endpoints.
// Yonetici duyuru olusturur -> alicilara cift kanal bildirim (in-app + Web Push).
// Alici yanit yazar -> duyuru sahibine geri push; sahip yazarsa -> zincirde mesaji olan kullanicilara.
// Goruldu: not_okundu deseni birebir (upsert + manuel SSE, audit yok - dongu sismesin).
// Veri gecici (24 saat mutlak TTL): okuma tarafinda da TTL filtresi (defense in depth;
// kalici silme background DuyuruTemizleyici ile Asama 6'da gelir). Kalici iz audit'te.
public static class DuyuruEndpoints
{
    private const int TtlSaat = 24;
    private const int IcerikLimit = 500;

    public static void MapDuyuruEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/duyurular")
            .WithTags("Duyurular")
            .RequireAuthorization();

        // LISTE - kullanicinin alicisi oldugu VEYA olusturdugu, TTL icindeki duyurular
        g.MapGet("/", async (AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null || uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tenantId = uc.AktifIsletmeId.Value;
            var kid = uc.KullaniciId.Value;
            var esik = DateTimeOffset.UtcNow.AddHours(-TtlSaat);

            var liste = await db.Duyurular
                .Where(d => d.IsletmeId == tenantId && d.OlusturmaZamani > esik)
                .Where(d => d.OlusturanKullaniciId == kid
                         || db.DuyuruAlicilari.Any(a => a.DuyuruId == d.Id && a.KullaniciId == kid))
                .OrderByDescending(d => d.OlusturmaZamani)
                .Select(d => new DuyuruOzetYaniti(
                    d.Id, d.Icerik, d.AliciTipi, d.OlusturanKullaniciId,
                    db.Kullanicilar.Where(k => k.Id == d.OlusturanKullaniciId)
                        .Select(k => k.AdSoyad).FirstOrDefault() ?? "",
                    d.OlusturmaZamani,
                    db.DuyuruAlicilari.Count(a => a.DuyuruId == d.Id),
                    db.DuyuruAlicilari.Count(a => a.DuyuruId == d.Id && a.Goruldu),
                    db.DuyuruAlicilari.Any(a => a.DuyuruId == d.Id && a.KullaniciId == kid && a.Goruldu),
                    db.DuyuruMesajlari.Count(m => m.DuyuruId == d.Id)))
                .ToListAsync(ct);

            return Results.Ok(liste);
        });

        // DETAY - alici goruldu durumlari (okundu avatarlari) + mesaj zinciri
        g.MapGet("/{id:guid}", async (Guid id, AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null || uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tenantId = uc.AktifIsletmeId.Value;
            var kid = uc.KullaniciId.Value;
            var esik = DateTimeOffset.UtcNow.AddHours(-TtlSaat);

            var d = await db.Duyurular
                .FirstOrDefaultAsync(x => x.Id == id && x.IsletmeId == tenantId && x.OlusturmaZamani > esik, ct);
            if (d is null) return Results.NotFound();

            // Erisim: sahip veya alici. Yetkisiz uyeye 404 (varligini ifsa etme).
            var aliciMi = await db.DuyuruAlicilari.AnyAsync(a => a.DuyuruId == id && a.KullaniciId == kid, ct);
            if (d.OlusturanKullaniciId != kid && !aliciMi) return Results.NotFound();

            var alicilar = await db.DuyuruAlicilari
                .Where(a => a.DuyuruId == id)
                .Join(db.Kullanicilar, a => a.KullaniciId, k => k.Id,
                    (a, k) => new DuyuruAliciYaniti(a.KullaniciId, k.AdSoyad, a.Goruldu, a.GorulmeZamani))
                .ToListAsync(ct);

            var mesajlar = await db.DuyuruMesajlari
                .Where(m => m.DuyuruId == id)
                .Join(db.Kullanicilar, m => m.GonderenKullaniciId, k => k.Id,
                    (m, k) => new { m.Id, m.GonderenKullaniciId, k.AdSoyad, m.Icerik, m.OlusturmaZamani })
                .OrderBy(x => x.OlusturmaZamani)
                .Select(x => new DuyuruMesajYaniti(x.Id, x.GonderenKullaniciId, x.AdSoyad, x.Icerik, x.OlusturmaZamani))
                .ToListAsync(ct);

            var olusturanAd = await db.Kullanicilar
                .Where(k => k.Id == d.OlusturanKullaniciId)
                .Select(k => k.AdSoyad).FirstOrDefaultAsync(ct) ?? "";

            return Results.Ok(new DuyuruDetayYaniti(
                d.Id, d.Icerik, d.AliciTipi, d.OlusturanKullaniciId, olusturanAd,
                d.OlusturmaZamani, alicilar, mesajlar));
        });

        // OLUSTUR - yonetici duyuru paylasir, alicilara push gider.
        // Yetki otoritesi DB uyelik rolu (eski JWT'ye guvenilmez); frontend admin-only UI
        // ile birlikte defense in depth. GoruntumeModu 403 (middleware katman 1 + burada katman 2).
        g.MapPost("/", async (
            DuyuruOlusturIstegi req, AppDbContext db, IUserContext uc,
            IAuditService audit, INotBildirimServisi bildirim, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null || uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);
            var tenantId = uc.AktifIsletmeId.Value;
            var kid = uc.KullaniciId.Value;

            var adminMi = await db.IsletmeUyelikleri
                .AnyAsync(u => u.IsletmeId == tenantId && u.KullaniciId == kid && u.Aktif && u.Rol == "admin", ct);
            if (!adminMi) return Results.StatusCode(403);

            var icerik = (req.Icerik ?? "").Trim();
            if (string.IsNullOrWhiteSpace(icerik))
                return Results.BadRequest(new { hata = "ICERIK_ZORUNLU", mesaj = "Duyuru metni zorunlu." });
            if (icerik.Length > IcerikLimit)
                return Results.BadRequest(new { hata = "ICERIK_UZUN", mesaj = "Duyuru metni en fazla 500 karakter olabilir." });
            if (req.AliciTipi != "tum" && req.AliciTipi != "secili")
                return Results.BadRequest(new { hata = "ALICI_TIPI_GECERSIZ", mesaj = "Alıcı tipi 'tum' veya 'secili' olmalı." });

            List<Guid> aliciIdler;
            if (req.AliciTipi == "tum")
            {
                aliciIdler = await db.IsletmeUyelikleri
                    .Where(u => u.IsletmeId == tenantId && u.Aktif && u.KullaniciId != kid)
                    .Select(u => u.KullaniciId)
                    .ToListAsync(ct);
            }
            else
            {
                var istenen = (req.AliciIdler ?? new List<Guid>())
                    .Where(x => x != kid).Distinct().ToList();
                if (istenen.Count == 0)
                    return Results.BadRequest(new { hata = "ALICI_ZORUNLU", mesaj = "En az bir alıcı seçilmeli." });

                // Defense in depth: alicilar bu tenant'in AKTIF uyesi olmali (tenant sizintisi sifir tolerans)
                aliciIdler = await db.IsletmeUyelikleri
                    .Where(u => u.IsletmeId == tenantId && u.Aktif && istenen.Contains(u.KullaniciId))
                    .Select(u => u.KullaniciId)
                    .ToListAsync(ct);
                if (aliciIdler.Count != istenen.Count)
                    return Results.BadRequest(new { hata = "ALICI_GECERSIZ", mesaj = "Alıcılardan bazıları bu işletmenin aktif üyesi değil." });
            }
            if (aliciIdler.Count == 0)
                return Results.BadRequest(new { hata = "ALICI_YOK", mesaj = "Duyuru gönderilecek üye bulunamadı." });

            var d = new Duyuru
            {
                IsletmeId = tenantId,
                OlusturanKullaniciId = kid,
                Icerik = icerik,
                AliciTipi = req.AliciTipi,
            };
            db.Duyurular.Add(d);
            foreach (var aid in aliciIdler)
                db.DuyuruAlicilari.Add(new DuyuruAlicisi { IsletmeId = tenantId, DuyuruId = d.Id, KullaniciId = aid });
            await db.SaveChangesAsync(ct);  // atomik: duyuru + tum alicilar tek transaction

            // Kalici iz: audit (SSE'ye otomatik duser). Icerik kirpilmis olarak detay'da saklanir.
            var kirp = icerik.Length <= 120 ? icerik : icerik.Substring(0, 120).TrimEnd() + "...";
            await audit.YazAsync("duyuru_paylasildi", "duyuru", d.Id,
                degisenAlanlar: JsonSerializer.Serialize(new { aliciTipi = d.AliciTipi, aliciSayisi = aliciIdler.Count }),
                detay: kirp, ct: ct);

            // Cift kanal bildirim (in-app + Web Push) - best effort, kayit zaten atomik yazildi
            await bildirim.DuyuruPaylasildi(d, aliciIdler, ct);

            return Results.Created($"/api/duyurular/{d.Id}", new { id = d.Id, olusturmaZamani = d.OlusturmaZamani });
        });

        // GORULDU - not_okundu deseni birebir: uye degilse sessiz no-op (super admin
        // goruntulemede iz birakmaz), audit YOK, manuel SSE (okundu avatarlari canli).
        g.MapPost("/{id:guid}/goruldu", async (
            Guid id, AppDbContext db, IUserContext uc, IAkisYayinci yayinci, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null || uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tenantId = uc.AktifIsletmeId.Value;
            var kid = uc.KullaniciId.Value;

            var uyeMi = await db.IsletmeUyelikleri.AnyAsync(u => u.IsletmeId == tenantId && u.KullaniciId == kid, ct);
            if (!uyeMi) return Results.Ok(new { ok = true, atlandi = true });

            var esik = DateTimeOffset.UtcNow.AddHours(-TtlSaat);
            var duyuruVar = await db.Duyurular
                .AnyAsync(x => x.Id == id && x.IsletmeId == tenantId && x.OlusturmaZamani > esik, ct);
            if (!duyuruVar) return Results.NotFound();

            var alici = await db.DuyuruAlicilari.FirstOrDefaultAsync(a => a.DuyuruId == id && a.KullaniciId == kid, ct);
            if (alici is null) return Results.Ok(new { ok = true, atlandi = true });  // alici degil (orn. duyuru sahibi)

            if (!alici.Goruldu)
            {
                alici.Goruldu = true;
                alici.GorulmeZamani = DateTimeOffset.UtcNow;  // ilk gorme ani; tekrarda degismez
                await db.SaveChangesAsync(ct);

                yayinci.Yayinla(new AkisOlayi(
                    Olay: "duyuru_goruldu", HedefTip: "duyuru", HedefId: id, IsletmeId: tenantId,
                    AktorEmail: uc.Email, AktorAdSoyad: uc.AdSoyad,
                    Detay: null, DegisenAlanlar: null, Zaman: DateTimeOffset.UtcNow));
            }
            return Results.Ok(new { ok = true });
        });

        // YANIT - konusma zinciri. Alici yazdi -> sahibe push; sahip yazdi -> zincirde
        // mesaji olan kullanicilara push. Yanit yazan alici otomatik "goruldu" sayilir.
        g.MapPost("/{id:guid}/yanit", async (
            Guid id, DuyuruYanitIstegi req, AppDbContext db, IUserContext uc,
            IAuditService audit, INotBildirimServisi bildirim, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null || uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);
            var tenantId = uc.AktifIsletmeId.Value;
            var kid = uc.KullaniciId.Value;

            var icerik = (req.Icerik ?? "").Trim();
            if (string.IsNullOrWhiteSpace(icerik))
                return Results.BadRequest(new { hata = "ICERIK_ZORUNLU", mesaj = "Yanıt metni zorunlu." });
            if (icerik.Length > IcerikLimit)
                return Results.BadRequest(new { hata = "ICERIK_UZUN", mesaj = "Yanıt metni en fazla 500 karakter olabilir." });

            var esik = DateTimeOffset.UtcNow.AddHours(-TtlSaat);
            var d = await db.Duyurular
                .FirstOrDefaultAsync(x => x.Id == id && x.IsletmeId == tenantId && x.OlusturmaZamani > esik, ct);
            if (d is null) return Results.NotFound();

            var sahipMi = d.OlusturanKullaniciId == kid;
            var alici = await db.DuyuruAlicilari.FirstOrDefaultAsync(a => a.DuyuruId == id && a.KullaniciId == kid, ct);
            if (!sahipMi && alici is null) return Results.NotFound();  // zincire dahil olmayan uye yazamaz

            var mesaj = new DuyuruMesaji
            {
                IsletmeId = tenantId,
                DuyuruId = id,
                GonderenKullaniciId = kid,
                Icerik = icerik,
            };
            db.DuyuruMesajlari.Add(mesaj);

            // Yanit yazan alici duyuruyu gormus sayilir (IsleyeniGorulduYap deseni)
            if (alici is not null && !alici.Goruldu)
            {
                alici.Goruldu = true;
                alici.GorulmeZamani = DateTimeOffset.UtcNow;
            }
            await db.SaveChangesAsync(ct);  // mesaj + goruldu atomik

            // Push hedefi: alici yazdi -> duyuru sahibi; sahip yazdi -> zincirde mesaji olan digerleri
            List<Guid> hedefler;
            if (sahipMi)
            {
                hedefler = await db.DuyuruMesajlari
                    .Where(m => m.DuyuruId == id && m.GonderenKullaniciId != kid)
                    .Select(m => m.GonderenKullaniciId)
                    .Distinct()
                    .ToListAsync(ct);
            }
            else
            {
                hedefler = new List<Guid> { d.OlusturanKullaniciId };
            }
            await bildirim.DuyuruYanitlandi(d, kid, hedefler, ct);

            // Audit (SSE'ye otomatik duser - manuel Yayinla YOK, cift olay olmasin)
            await audit.YazAsync("duyuru_yanitlandi", "duyuru", id, ct: ct);

            return Results.Ok(new DuyuruMesajYaniti(mesaj.Id, kid, uc.AdSoyad ?? "", mesaj.Icerik, mesaj.OlusturmaZamani));
        });
    }
}

// v20 - DTO'lar (endpoint dosyasinda; SuperAdminIsletmeEndpoints record deseni)
public sealed record DuyuruOlusturIstegi(string Icerik, string AliciTipi, List<Guid>? AliciIdler);
public sealed record DuyuruYanitIstegi(string Icerik);

public sealed record DuyuruAliciYaniti(Guid KullaniciId, string AdSoyad, bool Goruldu, DateTimeOffset? GorulmeZamani);
public sealed record DuyuruMesajYaniti(Guid Id, Guid GonderenKullaniciId, string GonderenAdSoyad, string Icerik, DateTimeOffset OlusturmaZamani);

public sealed record DuyuruOzetYaniti(
    Guid Id, string Icerik, string AliciTipi, Guid OlusturanKullaniciId, string OlusturanAdSoyad,
    DateTimeOffset OlusturmaZamani, int AliciSayisi, int GorenSayisi, bool BenGordum, int MesajSayisi);

public sealed record DuyuruDetayYaniti(
    Guid Id, string Icerik, string AliciTipi, Guid OlusturanKullaniciId, string OlusturanAdSoyad,
    DateTimeOffset OlusturmaZamani,
    IReadOnlyList<DuyuruAliciYaniti> Alicilar,
    IReadOnlyList<DuyuruMesajYaniti> Mesajlar);
