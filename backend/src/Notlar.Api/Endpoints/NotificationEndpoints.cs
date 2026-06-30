using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Models;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

public static class NotificationEndpoints
{
    public static void MapNotificationEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/bildirimler").WithTags("Bildirimler").RequireAuthorization();

        // LIST — tenant-scoped, son 15 bildirim + okunmamış sayısı
        g.MapGet("/", async (AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var uid = uc.KullaniciId.Value;
            var tenantId = uc.AktifIsletmeId.Value;

            var bildirimler = await db.Bildirimler
                .Where(b => b.KullaniciId == uid && b.IsletmeId == tenantId)
                .OrderByDescending(b => b.OlusturmaZamani)
                .Take(15)
                .Select(b => new BildirimYaniti(
                    b.Id, b.Tip, b.NotId, b.Baslik, b.Mesaj,
                    b.OkunduMu, b.OkumaZamani, b.OlusturmaZamani))
                .ToListAsync(ct);

            var okunmamis = await db.Bildirimler
                .CountAsync(b => b.KullaniciId == uid && b.IsletmeId == tenantId && !b.OkunduMu, ct);

            return Results.Ok(new BildirimOzetiYaniti(okunmamis, bildirimler));
        });

        // Tek bildirimi okundu — tenant-scoped
        g.MapPost("/{id:guid}/okundu", async (
            Guid id, AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tenantId = uc.AktifIsletmeId.Value;
            var b = await db.Bildirimler.FirstOrDefaultAsync(
                x => x.Id == id && x.KullaniciId == uc.KullaniciId.Value && x.IsletmeId == tenantId, ct);
            if (b is null) return Results.NotFound();
            if (!b.OkunduMu)
            {
                b.OkunduMu = true;
                b.OkumaZamani = DateTimeOffset.UtcNow;
                await db.SaveChangesAsync(ct);
            }
            return Results.NoContent();
        });

        // Hepsini okundu — tenant-scoped
        g.MapPost("/hepsi-okundu", async (
            AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var uid = uc.KullaniciId.Value;
            var tenantId = uc.AktifIsletmeId.Value;
            var simdi = DateTimeOffset.UtcNow;
            await db.Bildirimler
                .Where(b => b.KullaniciId == uid && b.IsletmeId == tenantId && !b.OkunduMu)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(b => b.OkunduMu, true)
                    .SetProperty(b => b.OkumaZamani, simdi), ct);
            return Results.NoContent();
        });

        // Tek bildirimi sil - tenant-scoped + sadece kendi bildirimi (kalici, DB'den de gider)
        g.MapDelete("/{id:guid}", async (
            Guid id, AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tenantId = uc.AktifIsletmeId.Value;
            var b = await db.Bildirimler.FirstOrDefaultAsync(
                x => x.Id == id && x.KullaniciId == uc.KullaniciId.Value && x.IsletmeId == tenantId, ct);
            if (b is null) return Results.NotFound();
            db.Bildirimler.Remove(b);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // Tumunu temizle - tenant-scoped + sadece kendi bildirimleri
        g.MapDelete("/", async (
            AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var uid = uc.KullaniciId.Value;
            var tenantId = uc.AktifIsletmeId.Value;
            await db.Bildirimler
                .Where(b => b.KullaniciId == uid && b.IsletmeId == tenantId)
                .ExecuteDeleteAsync(ct);
            return Results.NoContent();
        });
    }
}
