using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Notlar.Api.Entities;

namespace Notlar.Api.Services;

public interface IJwtService
{
    string TokenUret(Kullanici k, bool goruntulemeModu = false, int? sureSaat = null);
}

/// <summary>
/// v15 — JWT token üreticisi.
/// Yeni claim'ler: aktif_isletme_id (kullanıcının aktif tenant'ı), super_admin (sistem geneli yetki).
/// </summary>
public sealed class JwtService : IJwtService
{
    private readonly IConfiguration _cfg;
    public JwtService(IConfiguration cfg) { _cfg = cfg; }

    public string TokenUret(Kullanici k, bool goruntulemeModu = false, int? sureSaat = null)
    {
        var secret = _cfg["Jwt:Secret"] ?? throw new InvalidOperationException("Jwt:Secret yok");
        var issuer = _cfg["Jwt:Issuer"] ?? "notlar";
        var audience = _cfg["Jwt:Audience"] ?? "notlar";
        var gun = int.Parse(_cfg["Jwt:GunOmru"] ?? "30");

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, k.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, k.Email),
            new("ad_soyad", k.AdSoyad),
            new(ClaimTypes.Role, k.Rol),
            // v15 — Multi-tenant claim'ler
            new("super_admin", k.SuperAdmin ? "true" : "false"),
        };
        if (k.AktifIsletmeId.HasValue)
            claims.Add(new Claim("aktif_isletme_id", k.AktifIsletmeId.Value.ToString()));
        // v19 - server-authoritative impersonation: salt-okunur claim (frontend header'a guvenmez)
        if (goruntulemeModu)
            claims.Add(new Claim("goruntuleme_modu", "true"));

        // B2 - impersonation kisa omurlu (sureSaat), normal token gun bazli
        var sure = sureSaat.HasValue
            ? DateTime.UtcNow.AddHours(sureSaat.Value)
            : DateTime.UtcNow.AddDays(gun);
        var token = new JwtSecurityToken(issuer, audience, claims,
            expires: sure, signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
