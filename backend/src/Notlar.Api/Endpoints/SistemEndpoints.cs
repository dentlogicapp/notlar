using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using Notlar.Api.Models;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

/// <summary>
/// v17 — Süper admin sistem metin anahtar kataloğu endpoint'leri.
/// Tüm grup RequireSuperAdmin guard'ı altında; doğrudan AppDbContext (Senaryo A).
/// </summary>
public static class SistemEndpoints
{
    // İzin verilen enum kümeleri (spec Bölüm 2.1)
    private static readonly string[] Tipler = { "subject", "body", "baslik", "metin", "placeholder_kisa" };
    private static readonly string[] Kategoriler = { "mail", "dashboard", "sayac", "bildirim", "form", "marka" };

    public static void MapSistemEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/super-admin/metin-anahtarlari")
            .WithTags("SuperAdmin")
            .RequireAuthorization()
            .RequireSuperAdmin();

        // GET / — tümü (Sira'ya göre)
        g.MapGet("/", async (AppDbContext db, CancellationToken ct) =>
        {
            var liste = await db.MetinAnahtarlari
                .OrderBy(x => x.Sira).ThenBy(x => x.Anahtar)
                .ToListAsync(ct);
            return Results.Ok(liste.Select(ToYanit).ToList());
        });

        // GET /{id} — tek detay
        g.MapGet("/{id:guid}", async (Guid id, AppDbContext db, CancellationToken ct) =>
        {
            var a = await db.MetinAnahtarlari.FindAsync(new object[] { id }, ct);
            return a is null
                ? Results.NotFound(new { hata = "ANAHTAR_BULUNAMADI", mesaj = "Metin anahtari bulunamadi." })
                : Results.Ok(ToYanit(a));
        });

        // POST / — oluştur
        g.MapPost("/", async (
            MetinAnahtariIstegi req, AppDbContext db,
            IAuditService audit, CancellationToken ct) =>
        {
            var (gecerli, hata, mesaj) = await Dogrula(req, db, null, ct);
            if (!gecerli)
                return Results.Json(new { hata, mesaj }, statusCode: hata == "ANAHTAR_BENZERSIZ_DEGIL" ? 409 : 400);

            var yeni = new MetinAnahtari
            {
                Anahtar = req.Anahtar.Trim(),
                Etiket = req.Etiket.Trim(),
                Yonlendirme = req.Yonlendirme.Trim(),
                Aciklama = (req.Aciklama ?? "").Trim(),
                Tip = req.Tip.Trim(),
                Zorunlu = req.Zorunlu ?? false,
                DesteklenenPlaceholderlar = JsonSerializer.Serialize(req.DesteklenenPlaceholderlar ?? new List<string>()),
                Sira = req.Sira ?? 100,
                Kategori = req.Kategori.Trim(),
            };
            db.MetinAnahtarlari.Add(yeni);
            // audit.YazAsync tek SaveChangesAsync ile anahtar insert'i + audit satirini atomik yazar
            await audit.YazAsync("metin_anahtari_olustur", "metin_anahtari", yeni.Id,
                degisenAlanlar: JsonSerializer.Serialize(new { anahtar = yeni.Anahtar, kategori = yeni.Kategori }), ct: ct);
            return Results.Ok(ToYanit(yeni));
        });

        // PUT /{id} — güncelle
        g.MapPut("/{id:guid}", async (
            Guid id, MetinAnahtariIstegi req, AppDbContext db,
            IAuditService audit, CancellationToken ct) =>
        {
            var a = await db.MetinAnahtarlari.FindAsync(new object[] { id }, ct);
            if (a is null)
                return Results.NotFound(new { hata = "ANAHTAR_BULUNAMADI", mesaj = "Metin anahtari bulunamadi." });

            var (gecerli, hata, mesaj) = await Dogrula(req, db, id, ct);
            if (!gecerli)
                return Results.Json(new { hata, mesaj }, statusCode: hata == "ANAHTAR_BENZERSIZ_DEGIL" ? 409 : 400);

            // diff (değişen alan eski/yeni snapshot)
            var degisenler = new Dictionary<string, object>();
            var yAnahtar = req.Anahtar.Trim();
            var yEtiket = req.Etiket.Trim();
            var yYonlendirme = req.Yonlendirme.Trim();
            var yAciklama = (req.Aciklama ?? "").Trim();
            var yTip = req.Tip.Trim();
            var yZorunlu = req.Zorunlu ?? false;
            var yPlaceholder = JsonSerializer.Serialize(req.DesteklenenPlaceholderlar ?? new List<string>());
            var ySira = req.Sira ?? 100;
            var yKategori = req.Kategori.Trim();

            if (yAnahtar != a.Anahtar) { degisenler["Anahtar"] = new { eski = a.Anahtar, yeni = yAnahtar }; a.Anahtar = yAnahtar; }
            if (yEtiket != a.Etiket) { degisenler["Etiket"] = new { eski = a.Etiket, yeni = yEtiket }; a.Etiket = yEtiket; }
            if (yYonlendirme != a.Yonlendirme) { degisenler["Yonlendirme"] = new { eski = a.Yonlendirme, yeni = yYonlendirme }; a.Yonlendirme = yYonlendirme; }
            if (yAciklama != a.Aciklama) { degisenler["Aciklama"] = new { eski = a.Aciklama, yeni = yAciklama }; a.Aciklama = yAciklama; }
            if (yTip != a.Tip) { degisenler["Tip"] = new { eski = a.Tip, yeni = yTip }; a.Tip = yTip; }
            if (yZorunlu != a.Zorunlu) { degisenler["Zorunlu"] = new { eski = a.Zorunlu, yeni = yZorunlu }; a.Zorunlu = yZorunlu; }
            if (yPlaceholder != a.DesteklenenPlaceholderlar) { degisenler["DesteklenenPlaceholderlar"] = new { eski = a.DesteklenenPlaceholderlar, yeni = yPlaceholder }; a.DesteklenenPlaceholderlar = yPlaceholder; }
            if (ySira != a.Sira) { degisenler["Sira"] = new { eski = a.Sira, yeni = ySira }; a.Sira = ySira; }
            if (yKategori != a.Kategori) { degisenler["Kategori"] = new { eski = a.Kategori, yeni = yKategori }; a.Kategori = yKategori; }

            // Değişiklik yoksa: yazma + audit yok, mevcut anahtarı dön
            if (degisenler.Count > 0)
            {
                a.GuncellemeZamani = DateTimeOffset.UtcNow;
                await audit.YazAsync("metin_anahtari_guncelle", "metin_anahtari", a.Id,
                    degisenAlanlar: JsonSerializer.Serialize(degisenler), ct: ct);
            }
            return Results.Ok(ToYanit(a));
        });

        // DELETE /{id} — hard sil
        g.MapDelete("/{id:guid}", async (
            Guid id, AppDbContext db, IAuditService audit, CancellationToken ct) =>
        {
            var a = await db.MetinAnahtarlari.FindAsync(new object[] { id }, ct);
            if (a is null)
                return Results.NotFound(new { hata = "ANAHTAR_BULUNAMADI", mesaj = "Metin anahtari bulunamadi." });

            db.MetinAnahtarlari.Remove(a);
            await audit.YazAsync("metin_anahtari_sil", "metin_anahtari", a.Id,
                degisenAlanlar: JsonSerializer.Serialize(new { anahtar = a.Anahtar }), ct: ct);
            return Results.Ok(new { mesaj = "Metin anahtari silindi." });
        });

        // POST /{id}/deprecate — soft (yeni tenant'lara önerilmez)
        g.MapPost("/{id:guid}/deprecate", async (
            Guid id, AppDbContext db, IAuditService audit, CancellationToken ct) =>
        {
            var a = await db.MetinAnahtarlari.FindAsync(new object[] { id }, ct);
            if (a is null)
                return Results.NotFound(new { hata = "ANAHTAR_BULUNAMADI", mesaj = "Metin anahtari bulunamadi." });
            if (a.Deprecated)
                return Results.Ok(ToYanit(a));   // idempotent: zaten deprecated

            a.Deprecated = true;
            a.GuncellemeZamani = DateTimeOffset.UtcNow;
            await audit.YazAsync("metin_anahtari_deprecate", "metin_anahtari", a.Id,
                degisenAlanlar: JsonSerializer.Serialize(new { anahtar = a.Anahtar }), ct: ct);
            return Results.Ok(ToYanit(a));
        });

        // POST /{id}/kopyala — şablonla (yeni Id + benzersiz anahtar)
        g.MapPost("/{id:guid}/kopyala", async (
            Guid id, AppDbContext db, IAuditService audit, CancellationToken ct) =>
        {
            var kaynak = await db.MetinAnahtarlari.FindAsync(new object[] { id }, ct);
            if (kaynak is null)
                return Results.NotFound(new { hata = "ANAHTAR_BULUNAMADI", mesaj = "Metin anahtari bulunamadi." });

            // Benzersiz yeni anahtar üret: <anahtar>_kopya, _kopya_2, ...
            var temel = $"{kaynak.Anahtar}_kopya";
            var yeniAnahtar = temel;
            var sayac = 1;
            while (await db.MetinAnahtarlari.AnyAsync(x => x.Anahtar == yeniAnahtar, ct))
            {
                sayac++;
                yeniAnahtar = $"{temel}_{sayac}";
            }
            if (yeniAnahtar.Length > 80)
                return Results.Json(new { hata = "ANAHTAR_FORMATI_GECERSIZ", mesaj = "Kopya anahtar adi 80 karakteri asiyor." }, statusCode: 400);

            var kopya = new MetinAnahtari
            {
                Anahtar = yeniAnahtar,
                Etiket = kaynak.Etiket,
                Yonlendirme = kaynak.Yonlendirme,
                Aciklama = kaynak.Aciklama,
                Tip = kaynak.Tip,
                Zorunlu = kaynak.Zorunlu,
                DesteklenenPlaceholderlar = kaynak.DesteklenenPlaceholderlar,
                Sira = kaynak.Sira,
                Kategori = kaynak.Kategori,
            };
            db.MetinAnahtarlari.Add(kopya);
            await audit.YazAsync("metin_anahtari_kopyala", "metin_anahtari", kopya.Id,
                degisenAlanlar: JsonSerializer.Serialize(new { kaynak_anahtar = kaynak.Anahtar, yeni_anahtar = yeniAnahtar }), ct: ct);
            return Results.Ok(ToYanit(kopya));
        });
    }

    // --- Helper: entity -> yanit DTO (JSONB string -> List<string>) ---
    private static MetinAnahtariYaniti ToYanit(MetinAnahtari a) => new(
        a.Id, a.Anahtar, a.Etiket, a.Yonlendirme, a.Aciklama, a.Tip, a.Zorunlu,
        JsonSerializer.Deserialize<List<string>>(a.DesteklenenPlaceholderlar) ?? new List<string>(),
        a.Sira, a.Kategori, a.Deprecated, a.OlusturmaZamani, a.GuncellemeZamani);

    // --- Helper: validasyon (G.5 — placeholder sistem-katalog VEYA mevcut-anahtar) ---
    private static async Task<(bool gecerli, string? hata, string? mesaj)> Dogrula(
        MetinAnahtariIstegi req, AppDbContext db, Guid? mevcutId, CancellationToken ct)
    {
        var anahtar = (req.Anahtar ?? "").Trim();
        if (anahtar.Length is < 1 or > 80 || !Regex.IsMatch(anahtar, "^[a-z0-9_]+$"))
            return (false, "ANAHTAR_FORMATI_GECERSIZ", "Anahtar lowercase ASCII snake_case, 1-80 karakter olmali.");

        var cakisma = await db.MetinAnahtarlari
            .AnyAsync(x => x.Anahtar == anahtar && (mevcutId == null || x.Id != mevcutId), ct);
        if (cakisma)
            return (false, "ANAHTAR_BENZERSIZ_DEGIL", "Bu anahtar zaten tanimli.");

        var etiket = (req.Etiket ?? "").Trim();
        if (etiket.Length is < 1 or > 120)
            return (false, "DOGRULAMA_HATASI", "Etiket 1-120 karakter olmali.");

        var yonlendirme = (req.Yonlendirme ?? "").Trim();
        if (yonlendirme.Length is < 1 or > 500)
            return (false, "DOGRULAMA_HATASI", "Yonlendirme 1-500 karakter olmali.");

        var aciklama = (req.Aciklama ?? "").Trim();
        if (aciklama.Length > 1000)
            return (false, "DOGRULAMA_HATASI", "Aciklama en fazla 1000 karakter olmali.");

        if (!Tipler.Contains((req.Tip ?? "").Trim()))
            return (false, "TIP_GECERSIZ", "Gecersiz tip.");

        if (!Kategoriler.Contains((req.Kategori ?? "").Trim()))
            return (false, "KATEGORI_GECERSIZ", "Gecersiz kategori.");

        // Placeholder: her item snake_case + (sistem katalog VEYA mevcut anahtar)
        var phlar = req.DesteklenenPlaceholderlar ?? new List<string>();
        if (phlar.Count > 0)
        {
            var mevcutAnahtarlar = await db.MetinAnahtarlari.Select(x => x.Anahtar).ToListAsync(ct);
            foreach (var ph in phlar)
            {
                var p = (ph ?? "").Trim();
                if (!Regex.IsMatch(p, "^[a-z0-9_]+$"))
                    return (false, "PLACEHOLDER_TANIMSIZ", $"Gecersiz placeholder formati: {p}");
                if (!SistemPlaceholderlari.Tumu.Contains(p) && !mevcutAnahtarlar.Contains(p))
                    return (false, "PLACEHOLDER_TANIMSIZ", $"Tanimsiz placeholder: {p}");
            }
        }

        return (true, null, null);
    }
}