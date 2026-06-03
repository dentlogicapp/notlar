using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Models;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

/// <summary>
/// Yumuşak kilit (edit lock) — DuzenleDialog/TamamlaDialog/KlasorDuzenleDialog açılırken.
/// Heartbeat 15 sn, kilit 45 sn (3x güvenlik marjı). v15: tenant-scoped.
/// </summary>
public static class LockEndpoints
{
    private static readonly TimeSpan KilitSuresi = TimeSpan.FromSeconds(45);

    public static void MapLockEndpoints(this IEndpointRouteBuilder app)
    {
        var notG = app.MapGroup("/api/notlar").WithTags("Kilit").RequireAuthorization();
        var klsG = app.MapGroup("/api/klasorler").WithTags("Kilit").RequireAuthorization();

        // ─── NOT KİLİDİ ───────────────────────────────────────────────────

        notG.MapPost("/{id:guid}/kilit", async (
            Guid id, AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);

            var tenantId = uc.AktifIsletmeId.Value;
            var n = await db.Notlar
                .FirstOrDefaultAsync(x => x.Id == id && !x.Silindi && x.IsletmeId == tenantId, ct);
            if (n is null) return Results.NotFound();

            var simdi = DateTimeOffset.UtcNow;
            var benim = n.KilitKullaniciId == uc.KullaniciId.Value;
            var bos = n.KilitKullaniciId is null;
            var suresiDoldu = n.KilitZamani.HasValue && (simdi - n.KilitZamani.Value) > KilitSuresi;

            if (benim || bos || suresiDoldu)
            {
                n.KilitKullaniciId = uc.KullaniciId.Value;
                n.KilitZamani = simdi;
                await db.SaveChangesAsync(ct);
                return Results.Ok(new KilitYaniti(true, null));
            }

            var sahibi = await db.Kullanicilar
                .Where(u => u.Id == n.KilitKullaniciId)
                .Select(u => u.AdSoyad)
                .FirstOrDefaultAsync(ct);
            return Results.Json(new KilitYaniti(false, sahibi), statusCode: 409);
        });

        notG.MapPost("/{id:guid}/kilit/heartbeat", async (
            Guid id, AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();

            var tenantId = uc.AktifIsletmeId.Value;
            var n = await db.Notlar.FirstOrDefaultAsync(
                x => x.Id == id && !x.Silindi && x.IsletmeId == tenantId, ct);
            if (n is null) return Results.NotFound();

            if (n.KilitKullaniciId != uc.KullaniciId.Value)
                return Results.StatusCode(410);

            n.KilitZamani = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        notG.MapDelete("/{id:guid}/kilit", async (
            Guid id, AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();

            var tenantId = uc.AktifIsletmeId.Value;
            var n = await db.Notlar.FirstOrDefaultAsync(
                x => x.Id == id && !x.Silindi && x.IsletmeId == tenantId, ct);
            if (n is null) return Results.NoContent();

            if (n.KilitKullaniciId == uc.KullaniciId.Value)
            {
                n.KilitKullaniciId = null;
                n.KilitZamani = null;
                await db.SaveChangesAsync(ct);
            }
            return Results.NoContent();
        });

        // ─── KLASÖR KİLİDİ ────────────────────────────────────────────────

        klsG.MapPost("/{id:guid}/kilit", async (
            Guid id, AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (uc.GoruntumeModu) return Results.StatusCode(403);

            var tenantId = uc.AktifIsletmeId.Value;
            var k = await db.Klasorler.FirstOrDefaultAsync(
                x => x.Id == id && !x.Silindi && x.IsletmeId == tenantId, ct);
            if (k is null) return Results.NotFound();
            if (k.SistemMi)
                return Results.BadRequest(new { hata = "Sistem klasörü düzenlenemez." });

            var simdi = DateTimeOffset.UtcNow;
            var benim = k.KilitKullaniciId == uc.KullaniciId.Value;
            var bos = k.KilitKullaniciId is null;
            var suresiDoldu = k.KilitZamani.HasValue && (simdi - k.KilitZamani.Value) > KilitSuresi;

            if (benim || bos || suresiDoldu)
            {
                k.KilitKullaniciId = uc.KullaniciId.Value;
                k.KilitZamani = simdi;
                await db.SaveChangesAsync(ct);
                return Results.Ok(new KilitYaniti(true, null));
            }

            var sahibi = await db.Kullanicilar
                .Where(u => u.Id == k.KilitKullaniciId)
                .Select(u => u.AdSoyad)
                .FirstOrDefaultAsync(ct);
            return Results.Json(new KilitYaniti(false, sahibi), statusCode: 409);
        });

        klsG.MapPost("/{id:guid}/kilit/heartbeat", async (
            Guid id, AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();

            var tenantId = uc.AktifIsletmeId.Value;
            var k = await db.Klasorler.FirstOrDefaultAsync(
                x => x.Id == id && !x.Silindi && x.IsletmeId == tenantId, ct);
            if (k is null) return Results.NotFound();

            if (k.KilitKullaniciId != uc.KullaniciId.Value)
                return Results.StatusCode(410);

            k.KilitZamani = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        klsG.MapDelete("/{id:guid}/kilit", async (
            Guid id, AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();

            var tenantId = uc.AktifIsletmeId.Value;
            var k = await db.Klasorler.FirstOrDefaultAsync(
                x => x.Id == id && !x.Silindi && x.IsletmeId == tenantId, ct);
            if (k is null) return Results.NoContent();

            if (k.KilitKullaniciId == uc.KullaniciId.Value)
            {
                k.KilitKullaniciId = null;
                k.KilitZamani = null;
                await db.SaveChangesAsync(ct);
            }
            return Results.NoContent();
        });
    }

    public static async Task<string?> KilitBaskasiMi(
        AppDbContext db, Guid? kilitKullaniciId, DateTimeOffset? kilitZamani,
        Guid benId, CancellationToken ct)
    {
        if (kilitKullaniciId is null) return null;
        if (kilitKullaniciId == benId) return null;
        if (kilitZamani.HasValue && (DateTimeOffset.UtcNow - kilitZamani.Value) > KilitSuresi)
            return null;
        return await db.Kullanicilar
            .Where(u => u.Id == kilitKullaniciId.Value)
            .Select(u => u.AdSoyad)
            .FirstOrDefaultAsync(ct);
    }
}
