using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

// v20 - Duyuru Paylasimi endpoints. v20.1 ekleri:
//   - DELETE duyuru (K1: yalniz sahibi) + DELETE mesaj (K1: mesaj sahibi VEYA duyuru sahibi)
//   - POST mesaj-goruldu (batch; scroll tabanli yanit goruldu - IntersectionObserver frontend'te)
//   - Ozet: banner alanlari (BenGormedimMesajSayisi, SonMesajGonderenAdSoyad, SonMesajZamani)
//   - Detay: mesaj basina BenGordum + K2 kisitli Gorenler (yalniz mesaj sahibi + duyuru sahibi)
// Goruldu desenleri: not_okundu birebir. Veri gecici (24h TTL, DuyuruTemizleyici). Kalici iz audit'te.
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
                    db.DuyuruMesajlari.Count(m => m.DuyuruId == d.Id),
                    // v20.1 - banner alanlari: baskasinin yazdigi + benim okumadigim mesaj sayisi
                    db.DuyuruMesajlari.Count(m => m.DuyuruId == d.Id
                        && m.GonderenKullaniciId != kid
                        && !db.DuyuruMesajOkunmalar.Any(o => o.MesajId == m.Id && o.KullaniciId == kid)),
                    db.DuyuruMesajlari.Where(m => m.DuyuruId == d.Id)
                        .OrderByDescending(m => m.OlusturmaZamani)
                        .Select(m => db.Kullanicilar.Where(k => k.Id == m.GonderenKullaniciId)
                            .Select(k => k.AdSoyad).FirstOrDefault())
                        .FirstOrDefault(),
                    db.DuyuruMesajlari.Where(m => m.DuyuruId == d.Id)
                        .Max(m => (DateTimeOffset?)m.OlusturmaZamani),
                    d.GuncellemeZamani))
                .ToListAsync(ct);

            return Results.Ok(liste);
        });

        // DETAY - alici goruldu durumlari + mesaj zinciri (BenGordum + K2 kisitli Gorenler)
        g.MapGet("/{id:guid}", async (Guid id, AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null || uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tenantId = uc.AktifIsletmeId.Value;
            var kid = uc.KullaniciId.Value;
            var esik = DateTimeOffset.UtcNow.AddHours(-TtlSaat);

            var d = await db.Duyurular
                .FirstOrDefaultAsync(x => x.Id == id && x.IsletmeId == tenantId && x.OlusturmaZamani > esik, ct);
            if (d is null) return Results.NotFound();

            var aliciMi = await db.DuyuruAlicilari.AnyAsync(a => a.DuyuruId == id && a.KullaniciId == kid, ct);
            var benSahip = d.OlusturanKullaniciId == kid;
            if (!benSahip && !aliciMi) return Results.NotFound();  // erisim yok = yokmus gibi

            var alicilar = await db.DuyuruAlicilari
                .Where(a => a.DuyuruId == id)
                .Join(db.Kullanicilar, a => a.KullaniciId, k => k.Id,
                    (a, k) => new DuyuruAliciYaniti(a.KullaniciId, k.AdSoyad, a.Goruldu, a.GorulmeZamani))
                .OrderByDescending(x => x.Goruldu).ThenBy(x => x.GorulmeZamani)  // v20.2 madde 7 - gorenler kronolojik once, gormeyenler sonda
                .ToListAsync(ct);

            var mesajlarHam = await db.DuyuruMesajlari
                .Where(m => m.DuyuruId == id)
                .Join(db.Kullanicilar, m => m.GonderenKullaniciId, k => k.Id,
                    (m, k) => new { m.Id, m.GonderenKullaniciId, k.AdSoyad, m.Icerik, m.OlusturmaZamani })
                .OrderBy(x => x.OlusturmaZamani)
                .ToListAsync(ct);

            // v20.1 - okunmalar tek sorguda; bellekte mesaja gruplanir
            var mesajIdler = mesajlarHam.Select(x => x.Id).ToList();
            var okunmalar = await db.DuyuruMesajOkunmalar
                .Where(o => mesajIdler.Contains(o.MesajId))
                .Join(db.Kullanicilar, o => o.KullaniciId, k => k.Id,
                    (o, k) => new { o.MesajId, o.KullaniciId, k.AdSoyad, o.GorulmeZamani })
                .ToListAsync(ct);
            var okunmaGrup = okunmalar.GroupBy(o => o.MesajId).ToDictionary(gr => gr.Key, gr => gr.ToList());

            var mesajlar = mesajlarHam.Select(x =>
            {
                okunmaGrup.TryGetValue(x.Id, out var grup);
                var benGordum = x.GonderenKullaniciId == kid
                    || (grup != null && grup.Any(o => o.KullaniciId == kid));
                // K2 + defense in depth: goren listesi YALNIZ mesaj sahibine ve duyuru sahibine doldurulur
                IReadOnlyList<DuyuruMesajGorenYaniti>? gorenler = null;
                if (benSahip || x.GonderenKullaniciId == kid)
                {
                    gorenler = grup is null
                        ? new List<DuyuruMesajGorenYaniti>()
                        : grup.OrderBy(o => o.GorulmeZamani)
                            .Select(o => new DuyuruMesajGorenYaniti(o.KullaniciId, o.AdSoyad, o.GorulmeZamani))
                            .ToList();
                }
                return new DuyuruMesajYaniti(
                    x.Id, x.GonderenKullaniciId, x.AdSoyad, x.Icerik, x.OlusturmaZamani, benGordum, gorenler);
            }).ToList();

            var olusturanAd = await db.Kullanicilar
                .Where(k => k.Id == d.OlusturanKullaniciId)
                .Select(k => k.AdSoyad).FirstOrDefaultAsync(ct) ?? "";

            return Results.Ok(new DuyuruDetayYaniti(
                d.Id, d.Icerik, d.AliciTipi, d.OlusturanKullaniciId, olusturanAd,
                d.OlusturmaZamani, alicilar, mesajlar, d.GuncellemeZamani));
        });

        // OLUSTUR - yonetici duyuru paylasir (yetki otoritesi DB uyelik rolu; GoruntumeModu 403)
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
            await db.SaveChangesAsync(ct);  // atomik: duyuru + tum alicilar

            var kirp = icerik.Length <= 120 ? icerik : icerik.Substring(0, 120).TrimEnd() + "...";
            await audit.YazAsync("duyuru_paylasildi", "duyuru", d.Id,
                degisenAlanlar: JsonSerializer.Serialize(new { aliciTipi = d.AliciTipi, aliciSayisi = aliciIdler.Count }),
                detay: kirp, ct: ct);

            await bildirim.DuyuruPaylasildi(d, aliciIdler, ct);

            return Results.Created($"/api/duyurular/{d.Id}", new { id = d.Id, olusturmaZamani = d.OlusturmaZamani });
        });

        // v20.2 - DUZENLE (madde 6): YALNIZ sahibi. Icerik degisince goruldu listesi
        // SIFIRLANIR (not duzenleme mantigi): alicilar yeniden gorecek, avatarlar bastan.
        // Mesaj okunmalari KORUNUR (mesajlar degismedi). Icerik + sifirlama tek SaveChanges
        // (atomik); audit ardindan (duyuru_duzenlendi -> SSE otomatik).
        g.MapPut("/{id:guid}", async (
            Guid id, DuyuruDuzenleIstegi req, AppDbContext db, IUserContext uc,
            IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null || uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);
            var tenantId = uc.AktifIsletmeId.Value;
            var kid = uc.KullaniciId.Value;

            var icerik = (req.Icerik ?? "").Trim();
            if (string.IsNullOrWhiteSpace(icerik))
                return Results.BadRequest(new { hata = "ICERIK_ZORUNLU", mesaj = "Duyuru metni zorunlu." });
            if (icerik.Length > IcerikLimit)
                return Results.BadRequest(new { hata = "ICERIK_UZUN", mesaj = "Duyuru metni en fazla 500 karakter olabilir." });

            var esik = DateTimeOffset.UtcNow.AddHours(-TtlSaat);
            var d = await db.Duyurular
                .FirstOrDefaultAsync(x => x.Id == id && x.IsletmeId == tenantId && x.OlusturmaZamani > esik, ct);
            if (d is null) return Results.NotFound();
            if (d.OlusturanKullaniciId != kid) return Results.StatusCode(403);
            if (d.Icerik == icerik) return Results.Ok(new { ok = true, degisiklikYok = true });

            d.Icerik = icerik;
            d.GuncellemeZamani = DateTimeOffset.UtcNow;  // B1 - "(duzenlendi)" rozeti
            var alicilar = await db.DuyuruAlicilari.Where(a => a.DuyuruId == id).ToListAsync(ct);
            foreach (var a in alicilar) { a.Goruldu = false; a.GorulmeZamani = null; }
            await db.SaveChangesAsync(ct);  // icerik + goruldu sifirlama atomik

            var kirp = icerik.Length <= 120 ? icerik : icerik.Substring(0, 120).TrimEnd() + "...";
            await audit.YazAsync("duyuru_duzenlendi", "duyuru", id,
                degisenAlanlar: JsonSerializer.Serialize(new { gorulduSifirlandi = alicilar.Count }),
                detay: kirp, ct: ct);

            return Results.Ok(new { ok = true, guncellemeZamani = d.GuncellemeZamani });
        });

        // GORULDU (duyuru ana metni) - not_okundu deseni: sessiz no-op, audit yok, manuel SSE
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
            if (alici is null) return Results.Ok(new { ok = true, atlandi = true });

            if (!alici.Goruldu)
            {
                alici.Goruldu = true;
                alici.GorulmeZamani = DateTimeOffset.UtcNow;
                await db.SaveChangesAsync(ct);

                yayinci.Yayinla(new AkisOlayi(
                    Olay: "duyuru_goruldu", HedefTip: "duyuru", HedefId: id, IsletmeId: tenantId,
                    AktorEmail: uc.Email, AktorAdSoyad: uc.AdSoyad,
                    Detay: null, DegisenAlanlar: null, Zaman: DateTimeOffset.UtcNow));
            }
            return Results.Ok(new { ok = true });
        });

        // v20.1 - YANIT GORULDU (batch) - scroll tabanli mesaj goruldu (frontend IntersectionObserver).
        // Idempotent: UNIQUE(MesajId,KullaniciId) + on filtre; es zamanli cift istekte DbUpdateException yutulur.
        g.MapPost("/{id:guid}/mesaj-goruldu", async (
            Guid id, DuyuruMesajGorulduIstegi req, AppDbContext db, IUserContext uc,
            IAkisYayinci yayinci, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null || uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tenantId = uc.AktifIsletmeId.Value;
            var kid = uc.KullaniciId.Value;

            var uyeMi = await db.IsletmeUyelikleri.AnyAsync(u => u.IsletmeId == tenantId && u.KullaniciId == kid, ct);
            if (!uyeMi) return Results.Ok(new { ok = true, atlandi = true });

            var esik = DateTimeOffset.UtcNow.AddHours(-TtlSaat);
            var d = await db.Duyurular
                .FirstOrDefaultAsync(x => x.Id == id && x.IsletmeId == tenantId && x.OlusturmaZamani > esik, ct);
            if (d is null) return Results.NotFound();

            var sahipMi = d.OlusturanKullaniciId == kid;
            var aliciMi = await db.DuyuruAlicilari.AnyAsync(a => a.DuyuruId == id && a.KullaniciId == kid, ct);
            if (!sahipMi && !aliciMi) return Results.Ok(new { ok = true, atlandi = true });

            var istenen = (req.MesajIdler ?? new List<Guid>()).Distinct().ToList();
            if (istenen.Count == 0) return Results.Ok(new { ok = true, eklenen = 0 });

            // Bu duyuruya ait + baskasinin yazdigi + henuz okumadigim mesajlar
            var hedefler = await db.DuyuruMesajlari
                .Where(m => m.DuyuruId == id && istenen.Contains(m.Id)
                         && m.GonderenKullaniciId != kid
                         && !db.DuyuruMesajOkunmalar.Any(o => o.MesajId == m.Id && o.KullaniciId == kid))
                .Select(m => m.Id)
                .ToListAsync(ct);
            if (hedefler.Count == 0) return Results.Ok(new { ok = true, eklenen = 0 });

            foreach (var mid in hedefler)
                db.DuyuruMesajOkunmalar.Add(new DuyuruMesajOkunma { IsletmeId = tenantId, MesajId = mid, KullaniciId = kid });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException) { /* es zamanli cift istek: UNIQUE index korur, idempotent no-op */ }

            yayinci.Yayinla(new AkisOlayi(
                Olay: "duyuru_yanit_goruldu", HedefTip: "duyuru", HedefId: id, IsletmeId: tenantId,
                AktorEmail: uc.Email, AktorAdSoyad: uc.AdSoyad,
                Detay: null, DegisenAlanlar: null, Zaman: DateTimeOffset.UtcNow));

            return Results.Ok(new { ok = true, eklenen = hedefler.Count });
        });

        // YANIT - konusma zinciri (alici -> sahibe push; sahip -> zincirde mesaji olanlara push)
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
            if (!sahipMi && alici is null) return Results.NotFound();

            var mesaj = new DuyuruMesaji
            {
                IsletmeId = tenantId,
                DuyuruId = id,
                GonderenKullaniciId = kid,
                Icerik = icerik,
            };
            db.DuyuruMesajlari.Add(mesaj);

            if (alici is not null && !alici.Goruldu)
            {
                alici.Goruldu = true;
                alici.GorulmeZamani = DateTimeOffset.UtcNow;
            }
            await db.SaveChangesAsync(ct);  // mesaj + goruldu atomik

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

            await audit.YazAsync("duyuru_yanitlandi", "duyuru", id, ct: ct);

            return Results.Ok(new DuyuruMesajYaniti(
                mesaj.Id, kid, uc.AdSoyad ?? "", mesaj.Icerik, mesaj.OlusturmaZamani,
                true, new List<DuyuruMesajGorenYaniti>()));
        });

        // v20.1 - DUYURU SIL (K1: YALNIZ sahibi; TTL beklenmez). Alici+mesaj+okunma cascade.
        g.MapDelete("/{id:guid}", async (
            Guid id, AppDbContext db, IUserContext uc, IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null || uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);
            var tenantId = uc.AktifIsletmeId.Value;
            var kid = uc.KullaniciId.Value;

            var d = await db.Duyurular.FirstOrDefaultAsync(x => x.Id == id && x.IsletmeId == tenantId, ct);
            if (d is null) return Results.NotFound();
            if (d.OlusturanKullaniciId != kid) return Results.StatusCode(403);  // K1

            var aliciSayisi = await db.DuyuruAlicilari.CountAsync(a => a.DuyuruId == id, ct);
            var gorenSayisi = await db.DuyuruAlicilari.CountAsync(a => a.DuyuruId == id && a.Goruldu, ct);
            var mesajSayisi = await db.DuyuruMesajlari.CountAsync(m => m.DuyuruId == id, ct);

            db.Duyurular.Remove(d);
            await db.SaveChangesAsync(ct);

            // Audit (SSE'ye otomatik duser) - DuyuruTemizleyici sebep formatiyla uyumlu
            await audit.YazAsync("duyuru_silindi", "duyuru", id,
                degisenAlanlar: JsonSerializer.Serialize(new { sebep = "manuel", aliciSayisi, gorenSayisi, mesajSayisi }),
                ct: ct);

            return Results.Ok(new { ok = true });
        });

        // v20.1 - YANIT SIL (K1: mesaj sahibi VEYA duyuru sahibi [moderasyon]). Okunmalar cascade.
        g.MapDelete("/{id:guid}/mesajlar/{mesajId:guid}", async (
            Guid id, Guid mesajId, AppDbContext db, IUserContext uc, IAuditService audit, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null || uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);
            var tenantId = uc.AktifIsletmeId.Value;
            var kid = uc.KullaniciId.Value;

            var d = await db.Duyurular.FirstOrDefaultAsync(x => x.Id == id && x.IsletmeId == tenantId, ct);
            if (d is null) return Results.NotFound();
            var m = await db.DuyuruMesajlari.FirstOrDefaultAsync(x => x.Id == mesajId && x.DuyuruId == id, ct);
            if (m is null) return Results.NotFound();
            if (m.GonderenKullaniciId != kid && d.OlusturanKullaniciId != kid)
                return Results.StatusCode(403);  // K1

            db.DuyuruMesajlari.Remove(m);
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("duyuru_yaniti_silindi", "duyuru_mesaji", mesajId,
                degisenAlanlar: JsonSerializer.Serialize(new { duyuruId = id, gonderenKullaniciId = m.GonderenKullaniciId }),
                ct: ct);

            return Results.Ok(new { ok = true });
        });
    }
}

// DTO'lar (endpoint dosyasinda; SuperAdminIsletmeEndpoints record deseni)
public sealed record DuyuruOlusturIstegi(string Icerik, string AliciTipi, List<Guid>? AliciIdler);
public sealed record DuyuruYanitIstegi(string Icerik);
public sealed record DuyuruDuzenleIstegi(string Icerik);  // v20.2 madde 6
public sealed record DuyuruMesajGorulduIstegi(List<Guid>? MesajIdler);  // v20.1

public sealed record DuyuruAliciYaniti(Guid KullaniciId, string AdSoyad, bool Goruldu, DateTimeOffset? GorulmeZamani);
public sealed record DuyuruMesajGorenYaniti(Guid KullaniciId, string AdSoyad, DateTimeOffset GorulmeZamani);  // v20.1

// v20.1 - BenGordum + Gorenler (K2: null = bu listeyi gorme yetkin yok; [] = henuz goren yok)
public sealed record DuyuruMesajYaniti(
    Guid Id, Guid GonderenKullaniciId, string GonderenAdSoyad, string Icerik, DateTimeOffset OlusturmaZamani,
    bool BenGordum, IReadOnlyList<DuyuruMesajGorenYaniti>? Gorenler);

// v20.1 - banner alanlari eklendi (BenGormedimMesajSayisi, SonMesajGonderenAdSoyad, SonMesajZamani)
public sealed record DuyuruOzetYaniti(
    Guid Id, string Icerik, string AliciTipi, Guid OlusturanKullaniciId, string OlusturanAdSoyad,
    DateTimeOffset OlusturmaZamani, int AliciSayisi, int GorenSayisi, bool BenGordum, int MesajSayisi,
    int BenGormedimMesajSayisi, string? SonMesajGonderenAdSoyad, DateTimeOffset? SonMesajZamani, DateTimeOffset? GuncellemeZamani);

public sealed record DuyuruDetayYaniti(
    Guid Id, string Icerik, string AliciTipi, Guid OlusturanKullaniciId, string OlusturanAdSoyad,
    DateTimeOffset OlusturmaZamani,
    IReadOnlyList<DuyuruAliciYaniti> Alicilar,
    IReadOnlyList<DuyuruMesajYaniti> Mesajlar,
    DateTimeOffset? GuncellemeZamani);
