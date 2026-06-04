using Microsoft.AspNetCore.DataProtection;

namespace Notlar.Api.Services;

/// <summary>
/// v17 — AI API key şifreleme servisi. ASP.NET DataProtection (AES-256-GCM) sarmalar.
/// Şifreleme anahtarları /keys volume'unda kalıcı (docker-compose dataprotection_keys),
/// böylece deploy/restart sonrası mevcut cipher'lar çözülebilir kalır.
/// </summary>
public interface IApiKeyKripto
{
    string Sifrele(string ham);
    string Coz(string sifreli);
}

public sealed class DataProtectionApiKeyKripto : IApiKeyKripto
{
    private readonly IDataProtector _protector;
    public DataProtectionApiKeyKripto(IDataProtectionProvider provider)
        => _protector = provider.CreateProtector("Notlar.AiApiKey.v1");

    public string Sifrele(string ham) => _protector.Protect(ham);
    public string Coz(string sifreli) => _protector.Unprotect(sifreli);
}