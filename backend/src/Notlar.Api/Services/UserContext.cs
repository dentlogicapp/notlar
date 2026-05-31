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
    string? Ip { get; }
    string? KullaniciAjan { get; }
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

    public string? Ip => _a.HttpContext?.Connection.RemoteIpAddress?.ToString();
    public string? KullaniciAjan => _a.HttpContext?.Request.Headers.UserAgent.ToString();
}
