using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;

namespace Notlar.Api.Endpoints;

/// <summary>
/// v21 M6 (KN-A6) - Sistem geneli denetim gorunumu: super admin canli akisinin
/// DB kaynagi. Sayfa degisse de kayitlar DB'de durur (akis sifirlanmaz).
/// Tenant filtresi BILINCLI yoktur: super admin sistem gorunumu istisnasi
/// (SuperAdminFilter + RequireAuthorization cift katman koruma).
/// </summary>
public static class SuperAdminDenetimEndpoints
{
    public static void MapSuperAdminDenetimEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/super-admin/denetim").WithTags("SuperAdmin")
            .RequireAuthorization().RequireSuperAdmin();

        g.MapGet("/", async (AppDbContext db, int skip = 0, int take = 500, CancellationToken ct = default) =>
        {
            take = Math.Min(take, 500);
            var sorgu = db.DenetimGunlukleri.AsQueryable();
            var list = await sorgu
                .OrderByDescending(d => d.Zaman)
                .Skip(skip).Take(take)
                .Select(d => new SuperDenetimYaniti(
                    d.Id, d.Olay, d.HedefTip, d.HedefId, d.IsletmeId,
                    d.AktorEmail, d.Detay, d.DegisenAlanlar, d.Zaman))
                .ToListAsync(ct);
            var toplam = await sorgu.CountAsync(ct);
            return Results.Ok(new { toplam, kayitlar = list });
        });
    }
}

public sealed record SuperDenetimYaniti(
    Guid Id, string Olay, string? HedefTip, Guid? HedefId, Guid? IsletmeId,
    string? AktorEmail, string? Detay, string? DegisenAlanlar, DateTimeOffset Zaman);
