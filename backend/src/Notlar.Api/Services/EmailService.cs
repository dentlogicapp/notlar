using MailKit.Net.Smtp;
using MimeKit;

namespace Notlar.Api.Services;

public interface IEmailService
{
    Task SifreBelirleMailGonderAsync(string toEmail, string adSoyad, string link, CancellationToken ct = default);
    Task SifreSifirlamaMailGonderAsync(string toEmail, string adSoyad, string link, CancellationToken ct = default);
}

public sealed class EmailService : IEmailService
{
    private readonly IConfiguration _cfg;
    private readonly ILogger<EmailService> _log;

    public EmailService(IConfiguration cfg, ILogger<EmailService> log)
    {
        _cfg = cfg;
        _log = log;
    }

    public Task SifreBelirleMailGonderAsync(string toEmail, string adSoyad, string link, CancellationToken ct = default)
    {
        var konu = "Görev Defterine Hoş Geldin — Şifreni Belirle";
        var html = HtmlSablonu(
            baslik: $"Hoş geldin, {adSoyad}",
            paragraf: "Görev Defteri hesabın oluşturuldu. Aşağıdaki bağlantıya tıklayarak şifreni belirle. Bağlantı 24 saat geçerli.",
            buton: "Şifremi Belirle",
            link: link,
            altMetin: "Bu hesabı sen istemediysen, görmezden gelebilirsin."
        );
        return GonderAsync(toEmail, adSoyad, konu, html, ct);
    }

    public Task SifreSifirlamaMailGonderAsync(string toEmail, string adSoyad, string link, CancellationToken ct = default)
    {
        var konu = "Görev Defteri — Şifre Sıfırlama";
        var html = HtmlSablonu(
            baslik: "Şifre sıfırlama isteği",
            paragraf: $"Merhaba {adSoyad}, hesabın için şifre sıfırlama talebi alındı. Aşağıdaki bağlantı 1 saat geçerli.",
            buton: "Yeni Şifre Belirle",
            link: link,
            altMetin: "Bu isteği sen yapmadıysan, bu maili görmezden gel — hesabın güvende."
        );
        return GonderAsync(toEmail, adSoyad, konu, html, ct);
    }

    private async Task GonderAsync(string toEmail, string toAd, string konu, string html, CancellationToken ct)
    {
        var host = _cfg["Smtp:Host"] ?? "localhost";
        var port = int.Parse(_cfg["Smtp:Port"] ?? "1025");
        var user = _cfg["Smtp:User"];
        var pass = _cfg["Smtp:Pass"];
        var ssl = bool.Parse(_cfg["Smtp:Ssl"] ?? "false");
        var from = _cfg["Smtp:From"] ?? "notlar@local.test";
        var fromAd = _cfg["Smtp:FromName"] ?? "Görev Defteri";

        var msg = new MimeMessage();
        msg.From.Add(new MailboxAddress(fromAd, from));
        msg.To.Add(new MailboxAddress(toAd, toEmail));
        msg.Subject = konu;
        msg.Body = new TextPart("html") { Text = html };

        try
        {
            using var smtp = new SmtpClient();
            var sec = ssl ? MailKit.Security.SecureSocketOptions.StartTls
                          : MailKit.Security.SecureSocketOptions.None;
            await smtp.ConnectAsync(host, port, sec, ct);
            if (!string.IsNullOrEmpty(user))
                await smtp.AuthenticateAsync(user, pass, ct);
            await smtp.SendAsync(msg, ct);
            await smtp.DisconnectAsync(true, ct);
            _log.LogInformation("Mail gönderildi: {Email} ({Konu})", toEmail, konu);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Mail gönderim hatası: {Email}", toEmail);
            throw;
        }
    }

    private static string HtmlSablonu(string baslik, string paragraf, string buton, string link, string altMetin)
    {
        return $@"
<!DOCTYPE html>
<html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'></head>
<body style='margin:0;padding:0;background:#faf6ef;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;'>
  <table width='100%' cellpadding='0' cellspacing='0' style='padding:48px 16px;'>
    <tr><td align='center'>
      <table width='560' cellpadding='0' cellspacing='0' style='background:#ffffff;border-radius:16px;padding:48px 40px;border:1px solid #ebe3d4;'>
        <tr><td>
          <div style='text-align:center;font-size:28px;color:#c4704d;margin-bottom:24px;'>♡</div>
          <h1 style='font-family:Georgia,serif;font-size:28px;color:#3d2817;margin:0 0 12px;text-align:center;'>{baslik}</h1>
          <p style='color:#6b5947;font-size:15px;line-height:1.6;margin:0 0 32px;text-align:center;'>{paragraf}</p>
          <div style='text-align:center;margin:0 0 32px;'>
            <a href='{link}' style='display:inline-block;background:#3d2817;color:#faf6ef;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:500;font-size:15px;'>{buton}</a>
          </div>
          <p style='color:#9c8a73;font-size:13px;line-height:1.5;margin:0;text-align:center;'>{altMetin}</p>
          <hr style='border:none;border-top:1px solid #ebe3d4;margin:32px 0 16px;'>
          <p style='color:#9c8a73;font-size:11px;text-align:center;margin:0;'>Görev Defteri · dentlogicapp.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>";
    }
}
