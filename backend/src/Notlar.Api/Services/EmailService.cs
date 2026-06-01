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
    // Düğün tarihi: 1 Eylül 2026 00:00 TR (UTC+3) = 31 Ağustos 2026 21:00 UTC
    private static readonly DateTimeOffset DUGUN_UTC =
        new(2026, 8, 31, 21, 0, 0, TimeSpan.Zero);

    private readonly IConfiguration _cfg;
    private readonly ILogger<EmailService> _log;

    public EmailService(IConfiguration cfg, ILogger<EmailService> log)
    {
        _cfg = cfg;
        _log = log;
    }

    /// <summary>
    /// Yeni kullanıcıya gönderilen davetiye maili.
    /// Sevgi dolu ton + adım adım kullanım rehberi.
    /// Çift-kullanıcılı eş projesi olduğu için bu mail nişanlıya / eşe / sevgiliye yazılmış gibi.
    /// </summary>
    public Task SifreBelirleMailGonderAsync(string toEmail, string adSoyad, string link, CancellationToken ct = default)
    {
        var ilkAd = adSoyad.Split(' ')[0];
        var kalanGun = Math.Max(0, (int)Math.Ceiling((DUGUN_UTC - DateTimeOffset.UtcNow).TotalDays));

        var konu = $"{ilkAd}, planlama defterimiz seni bekliyor";
        var html = DavetiyeHtmlSablonu(ilkAd, link, kalanGun);
        return GonderAsync(toEmail, adSoyad, konu, html, ct);
    }

    /// <summary>
    /// Şifre sıfırlama maili. Profesyonel + güvenilir ton, branding tutarlılığı.
    /// </summary>
    public Task SifreSifirlamaMailGonderAsync(string toEmail, string adSoyad, string link, CancellationToken ct = default)
    {
        var ilkAd = adSoyad.Split(' ')[0];
        var konu = "Planlama Defterimiz — Şifre Sıfırlama";
        var html = SifreSifirlamaHtmlSablonu(ilkAd, link);
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
        var fromAd = _cfg["Smtp:FromName"] ?? "Planlama Defterimiz";

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

    /// <summary>
    /// Davetiye (yeni kullanıcı şifre belirleme) maili — sıcak ton + 6 adımlı kullanım rehberi.
    /// Email-safe HTML: inline CSS, tablo bazlı layout, mobile-friendly.
    /// </summary>
    private static string DavetiyeHtmlSablonu(string ilkAd, string link, int kalanGun)
    {
        // Düğün geçtiyse veya bugünse özel cümle
        var sayacCumle = kalanGun > 1
            ? $"Düğünümüze kaldı: <strong>{kalanGun} gün</strong>"
            : kalanGun == 1
                ? "Düğünümüze kaldı: <strong>1 gün</strong>"
                : kalanGun == 0
                    ? "Bugün <strong>en güzel günümüz</strong>"
                    : "Mutlu evliliğimizin <strong>güzel günlerinde</strong>";

        return $@"<!DOCTYPE html>
<html lang='tr'>
<head>
<meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1'>
<title>Planlama Defterimiz</title>
</head>
<body style='margin:0;padding:0;background:#faf6ef;font-family:-apple-system,BlinkMacSystemFont,""Segoe UI"",Roboto,sans-serif;color:#3d2817;'>
<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0' style='padding:32px 12px;background:#faf6ef;'>
  <tr><td align='center'>
    <table role='presentation' width='560' cellpadding='0' cellspacing='0' border='0' style='max-width:560px;background:#ffffff;border-radius:18px;border:1px solid #ebe3d4;overflow:hidden;'>

      <!-- HEADER kalp -->
      <tr><td style='padding:40px 40px 8px;text-align:center;'>
        <div style='font-size:36px;color:#c4704d;line-height:1;'>♡</div>
      </td></tr>

      <!-- BAŞLIK -->
      <tr><td style='padding:8px 40px 0;text-align:center;'>
        <h1 style='font-family:Georgia,""Times New Roman"",serif;font-size:30px;color:#3d2817;margin:0 0 6px;font-weight:600;letter-spacing:-0.02em;'>
          {ilkAd},
        </h1>
        <p style='color:#c4704d;font-size:14px;margin:0;font-style:italic;letter-spacing:0.04em;'>
          planlama defterimiz seni bekliyor 🤍
        </p>
      </td></tr>

      <!-- AÇILIŞ paragraf -->
      <tr><td style='padding:28px 40px 0;'>
        <p style='color:#5d4a37;font-size:15px;line-height:1.7;margin:0 0 14px;'>
          Bu küçük sistemi, en güzel günümüze adım adım hazırlanırken
          aklımıza gelen her şeyi <em>birlikte</em> planlayalım,
          <em>birlikte</em> tamamlayalım diye yaptım. Bir köşesi davetiyeler,
          bir köşesi nikâh hazırlığı, bir köşesi düğün öncesi alacaklarımız…
          Senin defterin, benim defterim, ikimizin defteri.
        </p>
        <p style='color:#5d4a37;font-size:15px;line-height:1.7;margin:0;text-align:center;'>
          {sayacCumle} ✨
        </p>
      </td></tr>

      <!-- CTA BUTON -->
      <tr><td style='padding:32px 40px 12px;text-align:center;'>
        <a href='{link}'
           style='display:inline-block;background:#3d2817;color:#faf6ef;padding:16px 36px;border-radius:10px;text-decoration:none;font-weight:500;font-size:15px;letter-spacing:0.01em;'>
          Hesabımı Aç ve Şifre Belirle
        </a>
        <p style='color:#9c8a73;font-size:12px;margin:14px 0 0;'>
          Bu bağlantı 24 saat geçerli.
        </p>
      </td></tr>

      <!-- AYIRICI -->
      <tr><td style='padding:32px 40px 8px;'>
        <table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0'>
          <tr>
            <td style='border-top:1px solid #ebe3d4;'></td>
            <td style='padding:0 14px;color:#c4704d;font-size:16px;'>♡</td>
            <td style='border-top:1px solid #ebe3d4;'></td>
          </tr>
        </table>
      </td></tr>

      <!-- REHBER BAŞLIK -->
      <tr><td style='padding:24px 40px 0;'>
        <h2 style='font-family:Georgia,""Times New Roman"",serif;font-size:20px;color:#3d2817;margin:0 0 6px;text-align:center;font-weight:600;'>
          İçeride seni neler bekliyor?
        </h2>
        <p style='color:#9c8a73;font-size:13px;margin:0;text-align:center;font-style:italic;'>
          Küçük rehberin
        </p>
      </td></tr>

      <!-- 1. GİRİŞ -->
      <tr><td style='padding:28px 40px 0;'>
        <p style='color:#3d2817;font-size:14px;font-weight:600;margin:0 0 4px;letter-spacing:0.04em;'>
          <span style='color:#c4704d;'>01</span> &nbsp; Giriş yapmak için
        </p>
        <p style='color:#5d4a37;font-size:14px;line-height:1.6;margin:0;'>
          Yukarıdaki butona tıklayıp kendi şifreni belirleyince hesabın hazır.
          Bir dahaki sefere sadece e-posta adresin ve şifrenle giriş yaparsın.
          Giriş ekranındaki <strong>“Beni hatırla”</strong> kutusunu işaretli
          bırakırsan her seferinde tekrar girmek zorunda kalmazsın.
        </p>
      </td></tr>

      <!-- 2. NOT EKLE -->
      <tr><td style='padding:22px 40px 0;'>
        <p style='color:#3d2817;font-size:14px;font-weight:600;margin:0 0 4px;letter-spacing:0.04em;'>
          <span style='color:#c4704d;'>02</span> &nbsp; Aklına bir şey geldiğinde
        </p>
        <p style='color:#5d4a37;font-size:14px;line-height:1.6;margin:0;'>
          Ana sayfada <em>“Bir not düşün…”</em> yazan kutuyu göreceksin.
          Aklındakini yaz, sağdaki <strong>Ekle</strong> butonuna dokun, oldu.
          İstersen sadece bir başlık, istersen detaylı bir açıklama —
          benimle paylaşacağın her şey kıymetli.
        </p>
      </td></tr>

      <!-- 3. TAMAMLA -->
      <tr><td style='padding:22px 40px 0;'>
        <p style='color:#3d2817;font-size:14px;font-weight:600;margin:0 0 4px;letter-spacing:0.04em;'>
          <span style='color:#c4704d;'>03</span> &nbsp; Bir şeyi tamamladığımızda
        </p>
        <p style='color:#5d4a37;font-size:14px;line-height:1.6;margin:0;'>
          Her notun yanında küçük bir kutucuk var. Ona tıkladığında
          <em>“Nasıl tamamlandı?”</em> diye sorulacak. Birkaç kelime yaz
          (örneğin: <em>“Davetiye baskısı bitti, cuma kargolanıyor”</em>) ki
          sonradan dönüp ne yaptığımızı hatırlayabilelim. Bu küçük detaylar
          ileride tatlı anılar olacak.
        </p>
      </td></tr>

      <!-- 4. GÜNCELLE -->
      <tr><td style='padding:22px 40px 0;'>
        <p style='color:#3d2817;font-size:14px;font-weight:600;margin:0 0 4px;letter-spacing:0.04em;'>
          <span style='color:#c4704d;'>04</span> &nbsp; Bir notu güncellemek
        </p>
        <p style='color:#5d4a37;font-size:14px;line-height:1.6;margin:0;'>
          Her notun altında üç küçük ikon göreceksin:
          <strong>göz</strong> (detaylar), <strong>kalem</strong> (düzenle),
          <strong>çöp kutusu</strong> (sil). Kalem ikonuna tıklayıp başlığı,
          içeriği veya hangi klasöre ait olduğunu istediğin gibi
          değiştirebilirsin.
        </p>
      </td></tr>

      <!-- 5. GEÇMİŞ -->
      <tr><td style='padding:22px 40px 0;'>
        <p style='color:#3d2817;font-size:14px;font-weight:600;margin:0 0 4px;letter-spacing:0.04em;'>
          <span style='color:#c4704d;'>05</span> &nbsp; Bir notun geçmişini görmek
        </p>
        <p style='color:#5d4a37;font-size:14px;line-height:1.6;margin:0;'>
          Aynı satırdaki <strong>göz</strong> ikonu, notun bütün geçmişini gösteriyor:
          ne zaman oluşturuldu, ne zaman ne değişti, kim ne yazdı, ne zaman tamamlandı…
          Hiçbir şey kaybolmuyor; ikimiz de birbirimizin dokunuşlarını görebiliyoruz.
        </p>
      </td></tr>

      <!-- 6. KLASÖRLER -->
      <tr><td style='padding:22px 40px 0;'>
        <p style='color:#3d2817;font-size:14px;font-weight:600;margin:0 0 4px;letter-spacing:0.04em;'>
          <span style='color:#c4704d;'>06</span> &nbsp; Konuları ayırmak için — klasörler
        </p>
        <p style='color:#5d4a37;font-size:14px;line-height:1.6;margin:0;'>
          Sol panelden <strong>“Yeni klasör”</strong> diyerek konuları gruplayabilirsin:
          <em>“Davetiye”, “Nikâh”, “Düğün Sonrası Tatil”</em> gibi.
          Notu eklerken veya düzenlerken hangi klasöre ait olduğunu seçebilirsin.
          İstersen bir klasörü sonradan silebilirsin — içindeki notlar kaybolmaz,
          sadece klasörsüz hâle gelir.
        </p>
      </td></tr>

      <!-- KAPANIŞ AYIRICI -->
      <tr><td style='padding:32px 40px 8px;'>
        <table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0'>
          <tr>
            <td style='border-top:1px solid #ebe3d4;'></td>
            <td style='padding:0 14px;color:#c4704d;font-size:16px;'>♡</td>
            <td style='border-top:1px solid #ebe3d4;'></td>
          </tr>
        </table>
      </td></tr>

      <!-- KAPANIŞ paragraf -->
      <tr><td style='padding:20px 40px 0;'>
        <p style='color:#5d4a37;font-size:15px;line-height:1.7;margin:0;text-align:center;font-style:italic;'>
          Hadi başlayalım. Mutlu olacağımız günlerde yazacağımız
          her satır için sabırsızım.
        </p>
        <p style='color:#3d2817;font-size:15px;margin:18px 0 0;text-align:center;'>
          Sevgilerle,<br>
          <strong style='font-family:Georgia,""Times New Roman"",serif;color:#c4704d;'>Aşkın</strong> 🤍
        </p>
      </td></tr>

      <!-- FOOTER -->
      <tr><td style='padding:40px 40px 32px;text-align:center;'>
        <p style='color:#9c8a73;font-size:11px;margin:0;line-height:1.6;'>
          Bu defter sadece ikimiz görüyoruz, üçüncü bir göz yok.<br>
          Planlama Defterimiz · <a href='https://notlar.dentlogicapp.com' style='color:#9c8a73;text-decoration:none;'>notlar.dentlogicapp.com</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>";
    }

    /// <summary>
    /// Şifre sıfırlama maili — sade, güvenilir ton, branding tutarlı.
    /// </summary>
    private static string SifreSifirlamaHtmlSablonu(string ilkAd, string link)
    {
        return $@"<!DOCTYPE html>
<html lang='tr'>
<head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'></head>
<body style='margin:0;padding:0;background:#faf6ef;font-family:-apple-system,BlinkMacSystemFont,""Segoe UI"",Roboto,sans-serif;color:#3d2817;'>
<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0' style='padding:48px 16px;'>
  <tr><td align='center'>
    <table role='presentation' width='560' cellpadding='0' cellspacing='0' border='0' style='max-width:560px;background:#ffffff;border-radius:16px;padding:48px 40px;border:1px solid #ebe3d4;'>
      <tr><td>
        <div style='text-align:center;font-size:32px;color:#c4704d;margin-bottom:20px;line-height:1;'>♡</div>
        <h1 style='font-family:Georgia,""Times New Roman"",serif;font-size:26px;color:#3d2817;margin:0 0 14px;text-align:center;font-weight:600;'>
          Şifre sıfırlama isteği
        </h1>
        <p style='color:#5d4a37;font-size:15px;line-height:1.7;margin:0 0 28px;text-align:center;'>
          Merhaba {ilkAd}, hesabın için şifre sıfırlama talebi alındı.
          Aşağıdaki bağlantı <strong>1 saat</strong> geçerli.
        </p>
        <div style='text-align:center;margin:0 0 28px;'>
          <a href='{link}' style='display:inline-block;background:#3d2817;color:#faf6ef;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:500;font-size:15px;'>
            Yeni Şifre Belirle
          </a>
        </div>
        <p style='color:#9c8a73;font-size:13px;line-height:1.6;margin:0;text-align:center;'>
          Bu isteği sen yapmadıysan bu maili görmezden gelebilirsin —
          hesabın güvende, şifren değişmez.
        </p>
        <hr style='border:none;border-top:1px solid #ebe3d4;margin:32px 0 16px;'>
        <p style='color:#9c8a73;font-size:11px;text-align:center;margin:0;'>
          Planlama Defterimiz · <a href='https://notlar.dentlogicapp.com' style='color:#9c8a73;text-decoration:none;'>notlar.dentlogicapp.com</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>";
    }
}
