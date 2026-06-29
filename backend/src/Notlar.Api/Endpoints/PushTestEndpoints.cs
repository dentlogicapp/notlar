using WebPush;

namespace Notlar.Api.Endpoints;

// GECICI push test endpoint'i - kanit sonrasi tamamen silinecek.
public static class PushTestEndpoints
{
    public static void MapPushTestEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/push/test", async (PushTestIstek istek) =>
        {
            // GECICI test anahtarlari - tam kurulumda yeniden uretilip ortam degiskenine tasinacak.
            const string vapidPublic =
                "BMFaomZjBM0eDaYAhWwjPDMEZZe-eRzn2mk-OF9fWr_dSrlm9bowa-5QQGZW03aKd61mb4l0xtiXZ80O0OPxHm4";
            const string vapidPrivate = "bOAhDRClI6L45dMKqHzhywWRTOvG3RxcQFyl93v0Se8";

            var subscription = new PushSubscription(istek.Endpoint, istek.P256dh, istek.Auth);
            var vapidDetails = new VapidDetails("mailto:destek@dentlogicapp.com", vapidPublic, vapidPrivate);
            var payload = System.Text.Json.JsonSerializer.Serialize(new
            {
                title = "Planlama Defterimiz",
                body = "Test bildirimi - push calisiyor!",
            });

            var client = new WebPushClient();
            try
            {
                await client.SendNotificationAsync(subscription, payload, vapidDetails);
                return Results.Ok(new { ok = true });
            }
            catch (WebPushException ex)
            {
                return Results.Json(
                    new { ok = false, hata = ex.Message, kod = (int)ex.StatusCode },
                    statusCode: 502);
            }
        })
        .AllowAnonymous()
        .WithTags("PushTest");
    }
}

public record PushTestIstek(string Endpoint, string P256dh, string Auth);
