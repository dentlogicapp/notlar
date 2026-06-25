using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

// v19 Asama 2 - Super admin tenant yonetimi: liste (B1 zengin + B3 saglik) + salt-okunur detay.
// Mevcut altyapi reuse: SuperAdminFilter guard, IsletmeMetinleri doluluk (sema pattern), AdminEndpoints sorgu sekli.
// Tenant olusturma/durum Asama 3'te eklenir.
public static class SuperAdminIsletmeEndpoints
{
    // B3 saglik skoru: 4 ceyrek x 25 puan (onboarding %100, ilk davetiye, son 30 gun aktif, en az 1 not).
    private static int SaglikHesapla(bool onboardingTam, bool davetiyeVar, bool son30Aktif, bool notVar)
        => (onboardingTam ? 25 : 0) + (davetiyeVar ? 25 : 0) + (son30Aktif ? 25 : 0) + (notVar ? 25 : 0);

    public static void MapSuperAdminIsletmeEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/super-admin/isletmeler")
            .WithTags("SuperAdminIsletme")
            .RequireAuthorization()
            .RequireSuperAdmin();

        // GET liste - B1 zengin response + B3 saglik skoru (toplu sorgular, N+1 yok)
        g.MapGet("", async (AppDbContext db, CancellationToken ct) =>
        {
            var esik30 = DateTimeOffset.UtcNow.AddDays(-30);

            var isletmeler = await db.Isletmeler
                .Where(i => !i.Silindi)
                .OrderByDescending(i => i.OlusturmaZamani)
                .ToListAsync(ct);

            // Uye sayisi (tenant basina)
            var uyeSayilari = (await db.IsletmeUyelikleri
                .GroupBy(u => u.IsletmeId)
                .Select(grp => new { IsletmeId = grp.Key, Sayi = grp.Count() })
                .ToListAsync(ct))
                .ToDictionary(x => x.IsletmeId, x => x.Sayi);

            // Son 30 gun aktif tenant'lar (uyelerden herhangi biri giris yaptiysa)
            var son30Set = (await db.IsletmeUyelikleri
                .Where(u => u.Kullanici.SonGirisZamani >= esik30)
                .Select(u => u.IsletmeId).Distinct().ToListAsync(ct))
                .ToHashSet();

            // En az 1 not yazan tenant'lar
            var notVarSet = (await db.Notlar
                .Where(n => !n.Silindi)
                .Select(n => n.IsletmeId).Distinct().ToListAsync(ct))
                .ToHashSet();

            // Onboarding: zorunlu Tenant anahtarlar + her tenant'in doldurdugu anahtarlar
            var zorunluSet = (await db.MetinAnahtarlari
                .Where(a => !a.Deprecated && a.Zorunlu && a.Kapsam == "Tenant")
                .Select(a => a.Anahtar).ToListAsync(ct))
                .ToHashSet(StringComparer.Ordinal);

            var doluByTenant = (await db.IsletmeMetinleri
                .Where(m => m.Icerik != "")
                .Select(m => new { m.IsletmeId, m.Anahtar }).ToListAsync(ct))
                .GroupBy(x => x.IsletmeId)
                .ToDictionary(grp => grp.Key, grp => grp.Select(x => x.Anahtar).ToHashSet(StringComparer.Ordinal));

            var liste = isletmeler.Select(i =>
            {
                var uyeSayi = uyeSayilari.GetValueOrDefault(i.Id, 0);
                doluByTenant.TryGetValue(i.Id, out var dolu);
                int doluZorunlu = dolu is null ? 0 : zorunluSet.Count(a => dolu.Contains(a));
                int dolulukYuzde = zorunluSet.Count > 0 ? (int)Math.Round(100.0 * doluZorunlu / zorunluSet.Count) : 0;

                var onboardingTam = zorunluSet.Count > 0 && doluZorunlu == zorunluSet.Count;
                var davetiyeVar = uyeSayi > 1;
                var son30 = son30Set.Contains(i.Id);
                var notVar = notVarSet.Contains(i.Id);
                var saglik = SaglikHesapla(onboardingTam, davetiyeVar, son30, notVar);

                return new IsletmeOzetYaniti(
                    i.Id, i.MarkaAdi, i.MarkaEmoji, i.KullanimModu, i.Aktif,
                    i.OlusturmaZamani, uyeSayi, dolulukYuzde, saglik);
            }).ToList();

            return Results.Ok(liste);
        });

        // GET detay - salt-okunur (uyeler + doluluk + saglik). Duzenleme endpoint'i YOK (v19 read-only).
        g.MapGet("/{id:guid}", async (Guid id, AppDbContext db, IIsletmeMetinService metinService, CancellationToken ct) =>
        {
            var i = await db.Isletmeler.FirstOrDefaultAsync(x => x.Id == id && !x.Silindi, ct);
            if (i is null)
                return Results.NotFound(new { hata = "ISLETME_BULUNAMADI", mesaj = "Isletme bulunamadi." });

            // Üye başına not/klasör sayıları: N+1 yerine tek grup sorgusu.
            var notSayilari = await db.Notlar.Where(n => n.IsletmeId == id && !n.Silindi)
                .GroupBy(n => n.OlusturanKullaniciId)
                .Select(g => new { KullaniciId = g.Key, Sayi = g.Count() })
                .ToDictionaryAsync(x => x.KullaniciId, x => x.Sayi, ct);
            var klasorSayilari = await db.Klasorler.Where(k => k.IsletmeId == id && !k.SistemMi && !k.Silindi)
                .GroupBy(k => k.OlusturanKullaniciId)
                .Select(g => new { KullaniciId = g.Key, Sayi = g.Count() })
                .ToDictionaryAsync(x => x.KullaniciId, x => x.Sayi, ct);

            var uyelerHam = await db.IsletmeUyelikleri
                .Where(u => u.IsletmeId == id)
                .OrderByDescending(u => u.KatilmaZamani)
                .Select(u => new
                {
                    u.Kullanici.Id, u.Kullanici.Email, u.Kullanici.AdSoyad,
                    u.Rol, u.Aktif,
                    SifreBelirlendi = u.Kullanici.SifreBelirlenmeZamani != null,
                    u.Kullanici.SonGirisZamani, u.Kullanici.Cinsiyet
                })
                .ToListAsync(ct);
            var uyeler = uyelerHam.Select(u => new IsletmeUyeYaniti(
                u.Id, u.Email, u.AdSoyad, u.Rol, u.Aktif, u.SifreBelirlendi, u.SonGirisZamani,
                notSayilari.GetValueOrDefault(u.Id, 0), klasorSayilari.GetValueOrDefault(u.Id, 0), u.Cinsiyet)).ToList();

            var zorunluSet = (await db.MetinAnahtarlari
                .Where(a => !a.Deprecated && a.Zorunlu && a.Kapsam == "Tenant")
                .Select(a => a.Anahtar).ToListAsync(ct))
                .ToHashSet(StringComparer.Ordinal);

            var dolu = (await db.IsletmeMetinleri
                .Where(m => m.IsletmeId == id && m.Icerik != "")
                .Select(m => m.Anahtar).ToListAsync(ct))
                .Where(a => zorunluSet.Contains(a)).ToHashSet(StringComparer.Ordinal);

            int dolulukYuzde = zorunluSet.Count > 0 ? (int)Math.Round(100.0 * dolu.Count / zorunluSet.Count) : 0;
            var onboardingTam = zorunluSet.Count > 0 && dolu.Count == zorunluSet.Count;
            var davetiyeVar = uyeler.Count > 1;
            var son30 = uyeler.Any(u => u.SonGiris >= DateTimeOffset.UtcNow.AddDays(-30));
            var notVar = notSayilari.Count > 0;
            var saglik = SaglikHesapla(onboardingTam, davetiyeVar, son30, notVar);

            // Tenant geneli istatistik + son aktivite (en güncel not ya da en son üye girişi).
            var toplamNot = notSayilari.Values.Sum();
            var toplamKlasor = klasorSayilari.Values.Sum();
            var sonNot = await db.Notlar.Where(n => n.IsletmeId == id && !n.Silindi)
                .MaxAsync(n => (DateTimeOffset?)n.GuncellemeZamani, ct);
            DateTimeOffset? sonGiris = uyeler.Count > 0 ? uyeler.Max(u => u.SonGiris) : null;
            DateTimeOffset? sonAktivite = sonNot;
            if (sonGiris.HasValue && (sonAktivite is null || sonGiris > sonAktivite)) sonAktivite = sonGiris;

            // Karsilama + sayac CANLI kaynaktan: isletme_metinleri (ana ekranin okudugu yer).
            // isletmeler.KarsilamaBasligi/Sayac* kolonlari v15 kalintisidir; tenant duzenleyince guncellenmez.
            var metinler = await metinService.TumunuGetirAsync(id, ct);
            var metinSozluk = metinler.ToDictionary(m => m.Anahtar, m => m.Icerik, StringComparer.Ordinal);
            string MetinAl(string anahtar) => metinSozluk.TryGetValue(anahtar, out var v) ? v : "";
            var karsilamaCanli = MetinAl("dashboard_karsilama_basligi");
            var sayacAktifCanli = MetinAl("sayac_aktif").Equals("true", StringComparison.OrdinalIgnoreCase);
            var sayacBasligiCanli = MetinAl("sayac_aktif_cumle");
            DateTime? sayacHedefCanli = DateTime.TryParse(MetinAl("sayac_hedef_tarihi"), out var dt) ? dt : null;

            return Results.Ok(new IsletmeDetayYaniti(
                i.Id, i.MarkaAdi, i.MarkaEmoji, i.KullanimModu, i.Aktif,
                karsilamaCanli, sayacAktifCanli, sayacBasligiCanli, sayacHedefCanli,
                i.OlusturmaZamani, i.OlusturanSuperAdminId,
                dolulukYuzde, saglik, toplamNot, toplamKlasor, sonAktivite, uyeler));
        });

        // POST olustur - yeni tenant (B1 ozet doner). Opsiyonel admin atama Asama 4'te entegre edilir.
        g.MapPost("", async (IsletmeOlusturIstegi req, AppDbContext db, IUserContext uc,
            IAuditService audit, IOperasyonelBildirimGonderici bildirim, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.MarkaAdi))
                return Results.BadRequest(new { hata = "MARKA_ADI_ZORUNLU", mesaj = "Marka adi zorunlu." });

            var gecerliModlar = new[] { "es", "aile", "ekip", "tatil", "ozel" };
            var mod = string.IsNullOrWhiteSpace(req.KullanimModu) ? "es" : req.KullanimModu.Trim();
            if (!gecerliModlar.Contains(mod))
                return Results.BadRequest(new { hata = "KULLANIM_MODU_GECERSIZ", mesaj = "Kullanim modu gecersiz." });

            var isletme = new Isletme
            {
                MarkaAdi = req.MarkaAdi.Trim(),
                MarkaEmoji = string.IsNullOrWhiteSpace(req.MarkaEmoji) ? "🏢" : req.MarkaEmoji.Trim(),
                KullanimModu = mod,
                OlusturanSuperAdminId = uc.KullaniciId,
                // v19 G - Notr/sektor-bagimsiz baslangic (dugun temasi DEGIL; admin onboarding'de ozellestirir)
                IkonSeti = "klasik",
                KarsilamaBasligi = "Hoş geldin",
                KarsilamaAltMetni = "Eklemek istediğin bir şey mi var? Yukarıdaki kutuya yazarak başla.",
                SayacAktif = false,
                SayacBasligi = "",
                MailImza = "",
                MailTonu = "profesyonel",
            };
            db.Isletmeler.Add(isletme);
            // v19 G.2 - marka_adi tenant kimligi: isletme_metinleri'ne seed et.
            // Mail + marka sayfasi bu tablodan okur (TumunuGetirAsync), Isletme.MarkaAdi entity'sinden DEGIL.
            // Seed edilmezse mail/konu marka_adi'yi katalog varsayilani ile cozer ("Markaniz") -> yanlis marka.
            db.IsletmeMetinleri.Add(new IsletmeMetni
            {
                IsletmeId = isletme.Id,
                Anahtar = "marka_adi",
                Icerik = isletme.MarkaAdi,
                GuncelleyenKullaniciId = uc.KullaniciId,
            });
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("tenant_olusturuldu", hedefTip: "isletme", hedefId: isletme.Id,
                degisenAlanlar: System.Text.Json.JsonSerializer.Serialize(
                    new { markaAdi = isletme.MarkaAdi, kullanimModu = isletme.KullanimModu }), ct: ct);

            bildirim.TenantOlusturuldu(isletme.MarkaAdi, uc.Email ?? "sistem");

            return Results.Ok(new IsletmeOzetYaniti(
                isletme.Id, isletme.MarkaAdi, isletme.MarkaEmoji, isletme.KullanimModu, isletme.Aktif,
                isletme.OlusturmaZamani, 0, 0, 0));
        });

        // v19 B5 - davet maili onizleme (yeni tenant icin varsayilan sablon + girilen marka/admin, gonderme yok)
        g.MapPost("/davet-onizle", async (DavetOnizleIstegi req, IEmailService email, CancellationToken ct) =>
        {
            var ad = string.IsNullOrWhiteSpace(req.AdminAd) ? "Yeni Yonetici" : req.AdminAd.Trim();
            var html = await email.DavetMailOnizleHtmlAsync(Guid.Empty, ad, req.MarkaAdi, ct);
            return Results.Ok(new { html });
        });

        // POST /{id}/durum - aktif/pasif toggle (soft; hard delete YOK)
        g.MapPost("/{id:guid}/durum", async (Guid id, AppDbContext db, IUserContext uc,
            IAuditService audit, IOperasyonelBildirimGonderici bildirim, CancellationToken ct) =>
        {
            var isletme = await db.Isletmeler.FirstOrDefaultAsync(x => x.Id == id && !x.Silindi, ct);
            if (isletme is null)
                return Results.NotFound(new { hata = "ISLETME_BULUNAMADI", mesaj = "Isletme bulunamadi." });

            var eski = isletme.Aktif;
            isletme.Aktif = !isletme.Aktif;
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("tenant_durum_degisti", hedefTip: "isletme", hedefId: isletme.Id,
                detay: isletme.MarkaAdi,
                degisenAlanlar: System.Text.Json.JsonSerializer.Serialize(
                    new { eski = eski ? "Aktif" : "Pasif", yeni = isletme.Aktif ? "Aktif" : "Pasif" }), ct: ct);

            if (!isletme.Aktif)
                bildirim.TenantPasiflestirildi(isletme.MarkaAdi, uc.Email ?? "sistem");

            return Results.Ok(new { id = isletme.Id, aktif = isletme.Aktif });
        });

        // DELETE /{id} - tenant soft delete (Silindi=true; veri korunur, liste'den gizlenir, geri alinabilir).
        // Hard delete YOK (veri guvenligi); kalici temizlik ayri deploy script'iyle yapilir.
        g.MapDelete("/{id:guid}", async (Guid id, AppDbContext db, IUserContext uc,
            IAuditService audit, IOperasyonelBildirimGonderici bildirim, CancellationToken ct) =>
        {
            var isletme = await db.Isletmeler.FirstOrDefaultAsync(x => x.Id == id && !x.Silindi, ct);
            if (isletme is null)
                return Results.NotFound(new { hata = "ISLETME_BULUNAMADI", mesaj = "Isletme bulunamadi." });

            isletme.Silindi = true;
            isletme.Aktif = false;
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("tenant_silindi", hedefTip: "isletme", hedefId: id,
                degisenAlanlar: System.Text.Json.JsonSerializer.Serialize(new { markaAdi = isletme.MarkaAdi }), ct: ct);
            bildirim.TenantPasiflestirildi(isletme.MarkaAdi, uc.Email ?? "sistem");

            return Results.Ok(new { ok = true });
        });

        // POST /{id}/admin-ata - tenant'a admin ata. AdminEndpoints CREATE pattern reuse; fark: path tenant + Rol sabit admin.
        g.MapPost("/{id:guid}/admin-ata", async (Guid id, IsletmeAdminAtaIstegi req, AppDbContext db,
            IEmailService email, IAuditService audit, IConfiguration cfg, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.AdSoyad))
                return Results.BadRequest(new { hata = "EMAIL_AD_ZORUNLU", mesaj = "Email ve ad soyad zorunlu." });
            if (req.Cinsiyet != "kadin" && req.Cinsiyet != "erkek")
                return Results.BadRequest(new { hata = "CINSIYET_GECERSIZ", mesaj = "Cinsiyet 'kadin' veya 'erkek' olmali." });

            var isletme = await db.Isletmeler.FirstOrDefaultAsync(x => x.Id == id && !x.Silindi, ct);
            if (isletme is null)
                return Results.NotFound(new { hata = "ISLETME_BULUNAMADI", mesaj = "Isletme bulunamadi." });

            var mail = req.Email.Trim().ToLowerInvariant();
            var mevcut = await db.Kullanicilar.FirstOrDefaultAsync(u => u.Email == mail, ct);
            Kullanici user;
            string? setupToken = null;
            bool yeniKullanici = false;

            if (mevcut is not null)
            {
                var zatenUye = await db.IsletmeUyelikleri
                    .AnyAsync(u => u.IsletmeId == id && u.KullaniciId == mevcut.Id, ct);
                if (zatenUye)
                    return Results.BadRequest(new { hata = "ZATEN_UYE", mesaj = "Bu kullanici zaten tenant'a uye." });
                user = mevcut;
            }
            else
            {
                user = new Kullanici
                {
                    Email = mail,
                    AdSoyad = req.AdSoyad.Trim(),
                    Rol = "kullanici",   // global default; tenant scope rol IsletmeUyelik'te
                    Cinsiyet = req.Cinsiyet,
                    Aktif = true,
                };
                db.Kullanicilar.Add(user);
                yeniKullanici = true;
                setupToken = AuthEndpoints.TokenUret();
                db.AuthTokenlar.Add(new AuthToken
                {
                    KullaniciId = user.Id,
                    Token = setupToken,
                    Amac = "setup",
                    GecerlilikSonu = DateTimeOffset.UtcNow.AddHours(24)
                });
            }

            db.IsletmeUyelikleri.Add(new IsletmeUyelik
            {
                IsletmeId = id,
                KullaniciId = user.Id,
                Rol = "admin",
                Aktif = true,
            });
            await db.SaveChangesAsync(ct);

            // v19 G - Bu tenant'ta sistem klasoru (Tamamlananlar) yoksa olustur (ilk admin olusturan olarak; idempotent).
            var sistemKlasorVar = await db.Klasorler
                .AnyAsync(k => k.IsletmeId == id && k.SistemMi && k.Ad == "Tamamlananlar", ct);
            if (!sistemKlasorVar)
            {
                db.Klasorler.Add(new Klasor
                {
                    IsletmeId = id,
                    Ad = "Tamamlananlar",
                    Aciklama = "Tamamlanan tüm notlar burada toplanır",
                    Ikon = "check-circle",
                    SistemMi = true,
                    OlusturanKullaniciId = user.Id,
                });
                await db.SaveChangesAsync(ct);
            }

            // Yeni kullanici -> davetiye/setup mail (metinler hedef tenant'in isletme_metinleri'nden render)
            if (yeniKullanici && setupToken is not null)
            {
                var frontend = cfg["FrontendBaseUrl"] ?? "http://localhost:3000";
                var link = $"{frontend}/sifre-belirle?token={setupToken}";
                await email.SifreBelirleMailGonderAsync(user.Email, user.AdSoyad, link, id, ct);
            }

            await audit.YazAsync("tenant_admin_atandi", hedefTip: "kullanici", hedefId: user.Id,
                degisenAlanlar: System.Text.Json.JsonSerializer.Serialize(
                    new { tenantId = id, email = mail, yeniKullanici }), ct: ct);

            return Results.Ok(new { kullaniciId = user.Id, email = mail, yeniKullanici, rol = "admin" });
        });

        // PUT /{id}/uye/{uyeId} - super admin herhangi bir tenant uyesinin ad/soyad/cinsiyetini gunceller.
        // Email DEGISMEZ. AdSoyad navigation FK uzerinden o tenant'in tum not/klasor/akisina aninda yansir.
        g.MapPut("/{id:guid}/uye/{uyeId:guid}", async (
            Guid id, Guid uyeId, IsletmeUyeGuncelleIstegi req, AppDbContext db,
            IAuditService audit, CancellationToken ct) =>
        {
            var uyelik = await db.IsletmeUyelikleri
                .Include(x => x.Kullanici)
                .FirstOrDefaultAsync(x => x.IsletmeId == id && x.KullaniciId == uyeId, ct);
            if (uyelik is null) return Results.NotFound(new { hata = "UYE_BULUNAMADI", mesaj = "Üye bu tenant'ta bulunamadı." });

            if (string.IsNullOrWhiteSpace(req.AdSoyad))
                return Results.BadRequest(new { hata = "AD_SOYAD_ZORUNLU", mesaj = "Ad soyad zorunlu." });
            if (req.Cinsiyet != "kadin" && req.Cinsiyet != "erkek")
                return Results.BadRequest(new { hata = "CINSIYET_GECERSIZ", mesaj = "Cinsiyet 'kadin' veya 'erkek' olmalı." });

            var user = uyelik.Kullanici;
            var eskiAd = user.AdSoyad;
            var eskiCinsiyet = user.Cinsiyet ?? "";
            var yeniAd = req.AdSoyad.Trim();
            var adDegisti = eskiAd != yeniAd;
            var cinsiyetDegisti = eskiCinsiyet != req.Cinsiyet;

            if (adDegisti || cinsiyetDegisti)
            {
                user.AdSoyad = yeniAd;
                user.Cinsiyet = req.Cinsiyet;
                await db.SaveChangesAsync(ct);

                var degisenler = new Dictionary<string, object>();
                if (adDegisti) degisenler["adSoyad"] = new { eski = eskiAd, yeni = yeniAd };
                if (cinsiyetDegisti) degisenler["cinsiyet"] = new { eski = eskiCinsiyet, yeni = req.Cinsiyet };
                await audit.YazAsync("uye_guncellendi_super", hedefTip: "kullanici", hedefId: uyeId,
                    degisenAlanlar: JsonSerializer.Serialize(degisenler),
                    detay: $"{user.Email}", ct: ct);
            }

            return Results.Ok(new { ok = true, kullaniciId = uyeId, adSoyad = user.AdSoyad, cinsiyet = user.Cinsiyet });
        });

        // POST /{id}/goruntule - B2 read-only impersonation basla.
        // Gecici JWT: aktif_isletme_id = hedef tenant (DB'ye YAZILMAZ, sadece token claim).
        // Server-authoritative: gecici JWT'de goruntuleme_modu claim + aktif_isletme_id=hedef.
        // Global write-guard middleware bu claim'i gorur -> tenant write 403 (frontend header'a guvenmez).
        g.MapPost("/{id:guid}/goruntule", async (Guid id, AppDbContext db, IUserContext uc,
            IJwtService jwt, IAuditService audit, HttpContext http, IConfiguration cfg, CancellationToken ct) =>
        {
            var isletme = await db.Isletmeler.FirstOrDefaultAsync(x => x.Id == id && !x.Silindi, ct);
            if (isletme is null)
                return Results.NotFound(new { hata = "ISLETME_BULUNAMADI", mesaj = "Isletme bulunamadi." });

            if (uc.KullaniciId is null) return Results.Unauthorized();
            var user = await db.Kullanicilar.FindAsync(new object[] { uc.KullaniciId.Value }, ct);
            if (user is null) return Results.Unauthorized();

            // v19 G.6 - super admin hedef tenant'a ZATEN UYE ise normal yetkiyle girer (goruntuleme modu
            // kapali, kendi tenant'i gibi yazabilir; JWT Role = tenant uyelik rolu). Uye degilse salt-okunur
            // impersonation (mevcut B2 davranisi: 1 saat, goruntuleme_modu=true).
            var hedefUyelik = await db.IsletmeUyelikleri
                .FirstOrDefaultAsync(u => u.IsletmeId == id && u.KullaniciId == user.Id && u.Aktif, ct);
            var hedefUyeMi = hedefUyelik is not null;

            // Gecici override: aktif tenant = hedef. SaveChanges YOK -> DB degismez, sadece token claim'i etkilenir.
            var gercekAktif = user.AktifIsletmeId;
            user.AktifIsletmeId = id;
            var token = hedefUyeMi
                ? jwt.TokenUret(user, aktifRol: hedefUyelik!.Rol)              // uye: normal yetki, goruntuleme yok
                : jwt.TokenUret(user, goruntulemeModu: true, sureSaat: 1);     // B2 - 1 saat salt-okunur impersonation
            user.AktifIsletmeId = gercekAktif;

            var gun = int.Parse(cfg["Jwt:GunOmru"] ?? "30");
            AuthEndpoints.CookieEkle(http, token, gun, cfg, persistent: true);

            await audit.YazAsync("tenant_olarak_gorus_basladi", hedefTip: "isletme", hedefId: id);

            return Results.Ok(new
            {
                ok = true,
                tenant = new { id = isletme.Id, markaAdi = isletme.MarkaAdi, markaEmoji = isletme.MarkaEmoji },
                gecerlilikBitis = DateTimeOffset.UtcNow.AddHours(1)  // B3 - frontend countdown (token 1 saat)
            });
        });

        // POST /goruntule/bitir - impersonation sonlandir (gercek AktifIsletmeId ile normal JWT'ye don).
        g.MapPost("/goruntule/bitir", async (AppDbContext db, IUserContext uc,
            IJwtService jwt, IAuditService audit, HttpContext http, IConfiguration cfg, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            var user = await db.Kullanicilar.FindAsync(new object[] { uc.KullaniciId.Value }, ct);
            if (user is null) return Results.Unauthorized();

            var token = jwt.TokenUret(user);  // gercek AktifIsletmeId DB'den
            var gun = int.Parse(cfg["Jwt:GunOmru"] ?? "30");
            AuthEndpoints.CookieEkle(http, token, gun, cfg, persistent: true);

            await audit.YazAsync("tenant_olarak_gorus_bitti");

            return Results.Ok(new { ok = true });
        });
    }
}

// v19 Asama 2 - DTO'lar (endpoint dosyasinda, SemaEndpoints record pattern reuse)
public record IsletmeOlusturIstegi(string MarkaAdi, string? MarkaEmoji, string KullanimModu);
public record DavetOnizleIstegi(string? MarkaAdi, string? AdminAd);  // v19 B5

public record IsletmeAdminAtaIstegi(string Email, string AdSoyad, string Cinsiyet);
// v19 - super admin tenant detayindan uye guncelleme (email DEGISMEZ)
public record IsletmeUyeGuncelleIstegi(string AdSoyad, string Cinsiyet);

public record IsletmeOzetYaniti(
    Guid Id, string MarkaAdi, string MarkaEmoji, string KullanimModu, bool Aktif,
    DateTimeOffset OlusturmaZamani, int UyeSayisi, int DolulukYuzde, int SaglikSkoru);

public record IsletmeUyeYaniti(
    Guid KullaniciId, string Email, string AdSoyad, string Rol, bool Aktif,
    bool SifreBelirlendi, DateTimeOffset? SonGiris, int NotSayisi, int KlasorSayisi, string? Cinsiyet);

public record IsletmeDetayYaniti(
    Guid Id, string MarkaAdi, string MarkaEmoji, string KullanimModu, bool Aktif,
    string KarsilamaBasligi, bool SayacAktif, string SayacBasligi, DateTime? SayacHedefTarihi,
    DateTimeOffset OlusturmaZamani, Guid? OlusturanSuperAdminId,
    int DolulukYuzde, int SaglikSkoru, int NotSayisi, int KlasorSayisi, DateTimeOffset? SonAktivite,
    IReadOnlyList<IsletmeUyeYaniti> Uyeler);
