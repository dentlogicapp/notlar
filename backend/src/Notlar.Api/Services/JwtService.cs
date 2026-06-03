using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Notlar.Api.Entities;

namespace Notlar.Api.Services;

public interface IJwtService
{
    string TokenUret(Kullanici k);
}

/// <summary>
/// v15 — JWT token üreticisi.
/// Yeni claim'ler: aktif_isletme_id (kullanıcının aktif tenant'ı), super_admin (sistem geneli yetki).
/// </summary>
public sealed class JwtService : IJwtService
{
    private readonly IConfiguration _cfg;
    public JwtService(IConfiguration cfg) { _cfg = cfg; }

    public string TokenUret(Kullanici k)
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

        var token = new JwtSecurityToken(issuer, audience, claims,
            expires: DateTime.UtcNow.AddDays(gun), signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
