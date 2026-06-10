using System.Text.Json;
using Notlar.Api.Models;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

// v18 Asama 19 B2 - tur analytics: hangi adimda kullanici dropout yapiyor (Stripe funnel pattern).
public static class TurAuditEndpoints
{
    private static readonly string[] GecerliEylemler =
        { "tur_adim_tamamlandi", "tur_adim_atlandi", "tur_tamamlandi", "tur_atlandi" };

    public static void MapTurAuditEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/tur-audit", async (TurAuditIstegi req, IAuditService audit, CancellationToken ct) =>
        {
            if (!GecerliEylemler.Contains(req.Eylem))
                return Results.Json(new { hata = "GECERSIZ_EYLEM" }, statusCode: 400);

            var detay = JsonSerializer.Serialize(new
            {
                adim_no = req.AdimNo,
                kalan_sure_sn = req.KalanSureSn,
                tarih = DateTimeOffset.UtcNow,
            });
            await audit.YazAsync(req.Eylem, "tur", null, degisenAlanlar: detay, ct: ct);
            return Results.Ok(new { kaydedildi = true });
        })
        .RequireAuthorization()
        .WithTags("Tur");
    }
}
