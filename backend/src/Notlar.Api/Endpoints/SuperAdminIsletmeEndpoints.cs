using Microsoft.EntityFrameworkCore;
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
        g.MapGet("/{id:guid}", async (Guid id, AppDbContext db, CancellationToken ct) =>
        {
            var i = await db.Isletmeler.FirstOrDefaultAsync(x => x.Id == id && !x.Silindi, ct);
            if (i is null)
                return Results.NotFound(new { hata = "ISLETME_BULUNAMADI", mesaj = "Isletme bulunamadi." });

            var uyeler = await db.IsletmeUyelikleri
                .Where(u => u.IsletmeId == id)
                .OrderByDescending(u => u.KatilmaZamani)
                .Select(u => new IsletmeUyeYaniti(
                    u.Kullanici.Id, u.Kullanici.Email, u.Kullanici.AdSoyad,
                    u.Rol, u.Aktif, u.Kullanici.SonGirisZamani))
                .ToListAsync(ct);

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
            var notVar = await db.Notlar.AnyAsync(n => n.IsletmeId == id && !n.Silindi, ct);
            var saglik = SaglikHesapla(onboardingTam, davetiyeVar, son30, notVar);

            return Results.Ok(new IsletmeDetayYaniti(
                i.Id, i.MarkaAdi, i.MarkaEmoji, i.KullanimModu, i.Aktif,
                i.KarsilamaBasligi, i.SayacAktif, i.SayacBasligi, i.SayacHedefTarihi,
                i.OlusturmaZamani, i.OlusturanSuperAdminId,
                dolulukYuzde, saglik, uyeler));
        });

        // POST olustur - yeni tenant (B1 ozet doner). Opsiyonel admin atama Asama 4'te entegre edilir.
        g.MapPost("", async (IsletmeOlusturIstegi req, AppDbContext db, IUserContext uc,
            IAuditService audit, CancellationToken ct) =>
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
            };
            db.Isletmeler.Add(isletme);
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("tenant_olusturuldu", hedefTip: "isletme", hedefId: isletme.Id,
                degisenAlanlar: System.Text.Json.JsonSerializer.Serialize(
                    new { markaAdi = isletme.MarkaAdi, kullanimModu = isletme.KullanimModu }), ct: ct);

            return Results.Ok(new IsletmeOzetYaniti(
                isletme.Id, isletme.MarkaAdi, isletme.MarkaEmoji, isletme.KullanimModu, isletme.Aktif,
                isletme.OlusturmaZamani, 0, 0, 0));
        });

        // POST /{id}/durum - aktif/pasif toggle (soft; hard delete YOK)
        g.MapPost("/{id:guid}/durum", async (Guid id, AppDbContext db, IUserContext uc,
            IAuditService audit, CancellationToken ct) =>
        {
            var isletme = await db.Isletmeler.FirstOrDefaultAsync(x => x.Id == id && !x.Silindi, ct);
            if (isletme is null)
                return Results.NotFound(new { hata = "ISLETME_BULUNAMADI", mesaj = "Isletme bulunamadi." });

            var eski = isletme.Aktif;
            isletme.Aktif = !isletme.Aktif;
            await db.SaveChangesAsync(ct);

            await audit.YazAsync("tenant_durum_degisti", hedefTip: "isletme", hedefId: isletme.Id,
                degisenAlanlar: System.Text.Json.JsonSerializer.Serialize(
                    new { eski, yeni = isletme.Aktif }), ct: ct);

            return Results.Ok(new { id = isletme.Id, aktif = isletme.Aktif });
        });
    }
}

// v19 Asama 2 - DTO'lar (endpoint dosyasinda, SemaEndpoints record pattern reuse)
public record IsletmeOlusturIstegi(string MarkaAdi, string? MarkaEmoji, string KullanimModu);

public record IsletmeOzetYaniti(
    Guid Id, string MarkaAdi, string MarkaEmoji, string KullanimModu, bool Aktif,
    DateTimeOffset OlusturmaZamani, int UyeSayisi, int DolulukYuzde, int SaglikSkoru);

public record IsletmeUyeYaniti(
    Guid KullaniciId, string Email, string AdSoyad, string Rol, bool Aktif,
    DateTimeOffset? SonGiris);

public record IsletmeDetayYaniti(
    Guid Id, string MarkaAdi, string MarkaEmoji, string KullanimModu, bool Aktif,
    string KarsilamaBasligi, bool SayacAktif, string SayacBasligi, DateTime? SayacHedefTarihi,
    DateTimeOffset OlusturmaZamani, Guid? OlusturanSuperAdminId,
    int DolulukYuzde, int SaglikSkoru, IReadOnlyList<IsletmeUyeYaniti> Uyeler);
