namespace Notlar.Api.Services;

public interface IPasswordService
{
    string Hashle(string sifre);
    bool Dogrula(string sifre, string hash);
    (bool Gecerli, string? Hata) PolitikaKontrol(string sifre);
}

public sealed class PasswordService : IPasswordService
{
    private const int BCryptWorkFactor = 11;

    public string Hashle(string sifre) =>
        BCrypt.Net.BCrypt.HashPassword(sifre, BCryptWorkFactor);

    public bool Dogrula(string sifre, string hash)
    {
        try { return BCrypt.Net.BCrypt.Verify(sifre, hash); }
        catch { return false; }
    }

    public (bool Gecerli, string? Hata) PolitikaKontrol(string sifre)
    {
        if (string.IsNullOrWhiteSpace(sifre))
            return (false, "Şifre boş olamaz.");
        if (sifre.Length < 8)
            return (false, "Şifre en az 8 karakter olmalı.");
        if (sifre.Length > 100)
            return (false, "Şifre en fazla 100 karakter olabilir.");
        if (!sifre.Any(char.IsUpper))
            return (false, "Şifre en az 1 büyük harf içermeli.");
        if (!sifre.Any(char.IsDigit))
            return (false, "Şifre en az 1 rakam içermeli.");
        return (true, null);
    }
}
