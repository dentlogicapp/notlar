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
    /// Salt-okunur goruntuleme modu (super admin baska tenant'i incelerken).
    /// v19 - Server-authoritative: JWT goruntuleme_modu claim'inden okunur (frontend header'a guvenmez).
    /// Global write-guard middleware POST/PATCH/PUT/DELETE'lerde 403 doner.
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

    // v19 - server-authoritative: JWT claim (frontend Goruntuleme-Modu header'i artik okunmaz)
    public bool GoruntumeModu => P?.FindFirst("goruntuleme_modu")?.Value == "true";

    public string? Ip => _a.HttpContext?.Connection.RemoteIpAddress?.ToString();
    public string? KullaniciAjan => _a.HttpContext?.Request.Headers.UserAgent.ToString();
}
