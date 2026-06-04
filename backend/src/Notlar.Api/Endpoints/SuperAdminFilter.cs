using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

/// <summary>
/// v17 — Süper admin route guard (endpoint filter).
/// JWT'deki super_admin claim'i true olmayan istekleri 403 ERISIM_YOK ile reddeder.
/// Defense in depth: backend zorunlu birinci katman; frontend AuthGuard requireSuperAdmin ikinci katman.
/// Kullanım: app.MapGroup("/api/super-admin/...").RequireSuperAdmin();
/// </summary>
public sealed class SuperAdminFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        var uc = ctx.HttpContext.RequestServices.GetRequiredService<IUserContext>();

        // Önce kimlik: token yoksa 401
        if (uc.KullaniciId is null)
            return Results.Unauthorized();

        // Sonra yetki: super_admin claim'i yoksa 403
        if (!uc.SuperAdmin)
            return Results.Json(
                new { hata = "ERISIM_YOK", mesaj = "Bu islem icin super admin yetkisi gerekli." },
                statusCode: 403);

        return await next(ctx);
    }
}

/// <summary>
/// Endpoint veya gruba süper admin guard'ını ekleyen extension.
/// Kullanım: g.RequireSuperAdmin();
/// </summary>
public static class SuperAdminFilterExtensions
{
    public static TBuilder RequireSuperAdmin<TBuilder>(this TBuilder builder)
        where TBuilder : IEndpointConventionBuilder
        => builder.AddEndpointFilter<SuperAdminFilter>();
}