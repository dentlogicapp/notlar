using System.Text.Json;
using System.Threading.Channels;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

/// <summary>
/// v19 Asama 7 - Super admin real-time olay akisi (SSE / text/event-stream).
/// Audit'in canli hali: tenant_olusturuldu, super_admin_atandi, tenant_durum_degisti,
/// kullanici_giris gibi sistem olaylari super admin paneline aninda dusen.
///
/// Tasarim:
///   - Tek-thread okuma dongusu: olay VEYA 30sn timeout (heartbeat). http.Response tek yazici
///     (thread-safe; ayri heartbeat task yok).
///   - Client disconnect (ct iptal) -> dongu biter, finally'de abone temizlenir.
///   - X-Accel-Buffering: no -> reverse proxy (Caddy/nginx) chunk buffering kapatir, anlik akis.
/// </summary>
public static class AkisEndpoints
{
    public static void MapAkisEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/super-admin/akis", async (HttpContext http, IAkisYayinci yayinci, CancellationToken ct) =>
        {
            http.Response.Headers.Append("Content-Type", "text/event-stream");
            http.Response.Headers.Append("Cache-Control", "no-cache");
            http.Response.Headers.Append("X-Accel-Buffering", "no");

            await http.Response.WriteAsync(": baglandi\n\n", ct);
            await http.Response.Body.FlushAsync(ct);

            var (id, reader) = yayinci.AboneOl();
            try
            {
                while (!ct.IsCancellationRequested)
                {
                    using var hbCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                    hbCts.CancelAfter(TimeSpan.FromSeconds(30));

                    AkisOlayi olay;
                    try
                    {
                        olay = await reader.ReadAsync(hbCts.Token);
                    }
                    catch (OperationCanceledException) when (!ct.IsCancellationRequested)
                    {
                        // 30sn olay gelmedi -> heartbeat (baglanti canli tut, proxy timeout'u onle)
                        await http.Response.WriteAsync(": heartbeat\n\n", ct);
                        await http.Response.Body.FlushAsync(ct);
                        continue;
                    }
                    catch (ChannelClosedException)
                    {
                        break;
                    }

                    var json = JsonSerializer.Serialize(olay);
                    await http.Response.WriteAsync($"event: {olay.Olay}\ndata: {json}\n\n", ct);
                    await http.Response.Body.FlushAsync(ct);
                }
            }
            catch (OperationCanceledException)
            {
                // client disconnect - normal kapanis
            }
            finally
            {
                yayinci.Cik(id);
            }
        }).RequireSuperAdmin();
    }
}
