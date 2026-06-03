using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace Notlar.Api.Services;

public interface IUserContext
{
    Guid? KullaniciId { get; }
    string? Email { get; }
    string? AdSoyad { get; }
    string? Rol { get; }
    bool Admin { get; }
    // v15 — Multi-tenant
    Guid? AktifIsletmeId { get; }
    bool SuperAdmin { get; }
    string? Ip { get; }
    string? KullaniciAjan { get; }
    /// <summary>
    /// v15 — Salt-okunur görüntüleme modu (süper admin başka tenant'ı incelerken).
    /// Frontend "Goruntuleme-Modu: true" header gönderir, backend POST/PATCH/DELETE'lerde 403 döner.
    /// </summary>
    bool GoruntumeModu { get; }
}

public sealed class UserContext : IUserContext
{
    private readonly IHttpContextAccessor _a;
    public UserContext(IHttpContextAccessor a) { _a = a; }
    private ClaimsPrincipal? P => _a.HttpContext?.User;

    public Guid? KullaniciId
    {
        get
        {
            var s = P?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
                 ?? P?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return Guid.TryParse(s, out var id) ? id : null;
        }
    }
    public string? Email => P?.FindFirst(JwtRegisteredClaimNames.Email)?.Value
                         ?? P?.FindFirst(ClaimTypes.Email)?.Value;
    public string? AdSoyad => P?.FindFirst("ad_soyad")?.Value;
    public string? Rol => P?.FindFirst(ClaimTypes.Role)?.Value;
    public bool Admin => Rol == "admin";

    // v15 — Multi-tenant
    public Guid? AktifIsletmeId
    {
        get
        {
            var s = P?.FindFirst("aktif_isletme_id")?.Value;
            return Guid.TryParse(s, out var id) ? id : null;
        }
    }
    public bool SuperAdmin => P?.FindFirst("super_admin")?.Value == "true";

    public bool GoruntumeModu =>
        _a.HttpContext?.Request.Headers["Goruntuleme-Modu"].ToString()
            ?.Equals("true", StringComparison.OrdinalIgnoreCase) == true;

    public string? Ip => _a.HttpContext?.Connection.RemoteIpAddress?.ToString();
    public string? KullaniciAjan => _a.HttpContext?.Request.Headers.UserAgent.ToString();
}
