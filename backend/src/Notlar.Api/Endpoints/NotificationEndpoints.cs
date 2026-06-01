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

        // LIST — son 30 bildirim + okunmamış sayısı (UserMenu poll'u için)
        g.MapGet("/", async (AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            var uid = uc.KullaniciId.Value;

            var bildirimler = await db.Bildirimler
                .Where(b => b.KullaniciId == uid)
                .OrderByDescending(b => b.OlusturmaZamani)
                .Take(30)
                .Select(b => new BildirimYaniti(
                    b.Id, b.Tip, b.NotId, b.Baslik, b.Mesaj,
                    b.OkunduMu, b.OkumaZamani, b.OlusturmaZamani))
                .ToListAsync(ct);

            var okunmamis = await db.Bildirimler
                .CountAsync(b => b.KullaniciId == uid && !b.OkunduMu, ct);

            return Results.Ok(new BildirimOzetiYaniti(okunmamis, bildirimler));
        });

        // Tek bildirimi okundu olarak işaretle
        g.MapPost("/{id:guid}/okundu", async (
            Guid id, AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            var b = await db.Bildirimler.FirstOrDefaultAsync(
                x => x.Id == id && x.KullaniciId == uc.KullaniciId.Value, ct);
            if (b is null) return Results.NotFound();
            if (!b.OkunduMu)
            {
                b.OkunduMu = true;
                b.OkumaZamani = DateTimeOffset.UtcNow;
                await db.SaveChangesAsync(ct);
            }
            return Results.NoContent();
        });

        // Hepsini okundu işaretle (UserMenu açıldığında çağrılır)
        g.MapPost("/hepsi-okundu", async (
            AppDbContext db, IUserContext uc, CancellationToken ct) =>
        {
            if (uc.KullaniciId is null) return Results.Unauthorized();
            var uid = uc.KullaniciId.Value;
            var simdi = DateTimeOffset.UtcNow;
            await db.Bildirimler
                .Where(b => b.KullaniciId == uid && !b.OkunduMu)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(b => b.OkunduMu, true)
                    .SetProperty(b => b.OkumaZamani, simdi), ct);
            return Results.NoContent();
        });
    }
}
