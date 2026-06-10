using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using Notlar.Api.Models;
using Notlar.Api.Services;
using Notlar.Api.Models.Sema;

namespace Notlar.Api.Endpoints;

// v18 Asama 11.9 B2 - read-only sistem semasi (super admin dokumantasyon paneli).
// Sema = AnahtarKatalogu (kod); bu endpoint DB'nin sync edilmis guncel halini + tenant doluluk doner.
public static class SemaEndpoints
{
    public static void MapSemaEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/super-admin/sema")
            .RequireAuthorization()
            .RequireSuperAdmin();

        g.MapGet("", async (AppDbContext db, CancellationToken ct) =>
        {
            var anahtarlar = await db.MetinAnahtarlari
                .OrderBy(x => x.Sira).ThenBy(x => x.Anahtar)
                .ToListAsync(ct);

            var toplamTenant = await db.Isletmeler.CountAsync(ct);

            // Tenant doluluk: anahtar basina kac DISTINCT tenant icerik girmis (bos haric).
            var dolulukRaw = await db.IsletmeMetinleri
                .Where(x => x.Icerik != "")
                .GroupBy(x => x.Anahtar)
                .Select(grp => new { Anahtar = grp.Key, Dolduran = grp.Select(x => x.IsletmeId).Distinct().Count() })
                .ToListAsync(ct);
            var doluluk = dolulukRaw.ToDictionary(x => x.Anahtar, x => x.Dolduran, StringComparer.Ordinal);

            var sonGuncelleme = anahtarlar.Count > 0
                ? anahtarlar.Max(x => x.GuncellemeZamani)
                : (DateTimeOffset?)null;

            var liste = anahtarlar.Select(a =>
            {
                List<string> ph;
                try { ph = JsonSerializer.Deserialize<List<string>>(a.DesteklenenPlaceholderlar) ?? new(); }
                catch { ph = new(); }
                doluluk.TryGetValue(a.Anahtar, out var dolduran);
                return new SemaAnahtarYaniti(
                    a.Anahtar, a.Kategori, a.Tip, a.Kapsam,
                    a.KarakterLimiti ?? TipDefault.KarakterLimiti(a.Tip),
                    a.KarakterLimiti,
                    a.Etiket, a.Yonlendirme, a.Aciklama,
                    ph, a.Zorunlu, a.Deprecated, a.Sira,
                    dolduran, toplamTenant);
            }).ToList();

            return Results.Ok(new SemaYaniti(AnahtarKatalogu.Version, sonGuncelleme, toplamTenant, liste));
        });
    }
}

public record SemaYaniti(
    string Surum,
    DateTimeOffset? SonGuncelleme,
    int ToplamTenant,
    IReadOnlyList<SemaAnahtarYaniti> Anahtarlar);

public record SemaAnahtarYaniti(
    string Anahtar,
    string Kategori,
    string Tip,
    string Kapsam,
    int EfektifLimit,
    int? OzelLimit,
    string Etiket,
    string Yonlendirme,
    string Aciklama,
    IReadOnlyList<string> Placeholderlar,
    bool Zorunlu,
    bool Deprecated,
    int Sira,
    int TenantDolduran,
    int TenantToplam);
