using System.Net;
using MailKit.Net.Smtp;
using MimeKit;
using Notlar.Api.Entities;

using Notlar.Api.Models.Sema;

namespace Notlar.Api.Services;

public interface IEmailService
{
    // v18 - davetiye metinleri (konu/giris/imza/marka) artik isletme_metinleri'nden render edilir (G.23-b).
    Task SifreBelirleMailGonderAsync(string toEmail, string adSoyad, string link, Guid isletmeId, CancellationToken ct = default);
    // v19 bonus - mevcut (sifresi olan) kullanici yeni tenant'a eklenince: "markaya eklendiniz, mevcut hesabinizla giris yapin" bilgilendirme maili.
    Task MarkayaEklendiMailGonderAsync(string toEmail, string adSoyad, string girisLink, Guid isletmeId, CancellationToken ct = default);
    // v19 B5 - davet maili onizleme (gonderme yok, HTML render doner). markaAdi override (yeni tenant henuz yoksa).
    Task<string> DavetMailOnizleHtmlAsync(Guid isletmeId, string aliciAd, string? markaAdi, CancellationToken ct = default);
    Task SifreSifirlamaMailGonderAsync(string toEmail, string adSoyad, string link, CancellationToken ct = default);
    // v18 - hatirlatma konusu isletme_metinleri'nden render edilir; body (Asama 6 kapsami disi) korunur.
    Task HatirlaticiMailGonderAsync(string toEmail, string aliciAdSoyad, string notBaslik, string? notIcerik,
        string? klasorAdi, string kimeMetin, DateTimeOffset hatirlatmaZamani, Guid notId, Guid isletmeId, CancellationToken ct = default);
    // v19 B8 - operasyonel bildirim (super admin'e; tenant context yok, kod-bound template)
    Task OperasyonelMailGonderAsync(string toEmail, string toAd, (string Konu, string Html) icerik, CancellationToken ct = default);
}

public sealed class EmailService : IEmailService
{
    // Düğün tarihi: 1 Eylül 2026 00:00 TR (UTC+3) = 31 Ağustos 2026 21:00 UTC
    private static readonly DateTimeOffset DUGUN_UTC =
        new(2026, 8, 31, 21, 0, 0, TimeSpan.Zero);

    private readonly IConfiguration _cfg;
    private readonly ILogger<EmailService> _log;
    private readonly IIsletmeMetinService _metin;
    private readonly ISablonResolver _resolver;
    private readonly IAuditService _audit;

    public EmailService(IConfiguration cfg, ILogger<EmailService> log,
        IIsletmeMetinService metin, ISablonResolver resolver, IAuditService audit)
    {
        _cfg = cfg;
        _log = log;
        _metin = metin;
        _resolver = resolver;
        _audit = audit;
    }

    // Tenant metinlerini anahtar -> icerik sozlugune cevirir (bos icerikli kayitlar atlanir).
    private static Dictionary<string, string> SozlukYap(IReadOnlyList<IsletmeMetni> metinler)
    {
        var d = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var m in metinler)
            if (!string.IsNullOrWhiteSpace(m.Icerik)) d[m.Anahtar] = m.Icerik!;
        return d;
    }

    // Anahtar tenant'ta dolu ise SablonResolver ile cozer; degilse fallback + zorunlu audit (mail_anahtar_eksik).
    // htmlEncode=false: body/konu metinleri admin-kontrollu, ic HTML (<em> vb.) korunur.
    private async Task<string> CozVeyaFallbackAsync(IReadOnlyDictionary<string, string> sozluk,
        string anahtar, string fallback, string mailTipi, Guid isletmeId,
        IReadOnlyDictionary<string, string> runtime, bool htmlEncode, CancellationToken ct)
    {
        if (sozluk.TryGetValue(anahtar, out var ham) && !string.IsNullOrWhiteSpace(ham))
        {
            // tenant metni + runtime degerler birlesik sozluk uzerinde ozyinelemeli cozulur
            var birlesik = new Dictionary<string, string>(sozluk, StringComparer.Ordinal);
            foreach (var kv in runtime) birlesik[kv.Key] = kv.Value;
            return _resolver.Coz(ham, birlesik, htmlEncode);
        }

        // Fallback: anahtar bos -> kod-bound NOTR varsayilan (AnahtarKatalogu); placeholder'lar resolve edilir.
        // Eski parametre fallback yalnizca katalogda Varsayilan tanimsizsa kullanilir (geriye uyumluluk).
        await _audit.YazAsync("mail_anahtar_eksik", hedefTip: "isletme_metni", hedefId: null,
            degisenAlanlar: System.Text.Json.JsonSerializer.Serialize(new
            {
                anahtar,
                mail_tipi = mailTipi,
                fallback_icerik_kullanildi = true,
                isletme_id = isletmeId
            }), ct: ct);

        var katalogVarsayilan = AnahtarKatalogu.Tumu
            .FirstOrDefault(a => a.Anahtar == anahtar)?.Varsayilan;
        if (!string.IsNullOrEmpty(katalogVarsayilan))
        {
            var birlesik2 = new Dictionary<string, string>(sozluk, StringComparer.Ordinal);
            foreach (var kv in runtime) birlesik2[kv.Key] = kv.Value;
            return _resolver.Coz(katalogVarsayilan, birlesik2, htmlEncode);
        }
        return fallback;
    }

    /// <summary>
    /// Davetiye maili — Alt-3: tek mail, gender-neutral, imza gönderenin gerçek ilk adı.
    /// 7 maddeli kullanım rehberi (05 - Hatırlatıcı kurmak dahil).
    /// </summary>
    public async Task SifreBelirleMailGonderAsync(string toEmail, string adSoyad, string link, Guid isletmeId, CancellationToken ct = default)
    {
        var (konu, html, replyTo, markaAdi) = await DavetMailRenderAsync(adSoyad, link, isletmeId, ct);
        await GonderAsync(toEmail, adSoyad, konu, html, ct, replyTo, fromAdOverride: markaAdi);
    }

    // v19 bonus - mevcut (sifresi olan) kullanici yeni tenant'a eklendiginde bilgilendirme maili.
    // Davet maili (sifre belirle) yerine: zaten hesabi var -> "ekibe eklendiniz, mevcut hesabinizla giris yapin".
    // marka_adi + imza + iletisim_email (replyTo) davet maili ile ayni kaynaktan (isletme_metinleri) cozulur.
    public async Task MarkayaEklendiMailGonderAsync(string toEmail, string adSoyad, string girisLink, Guid isletmeId, CancellationToken ct = default)
    {
        var aliciIlkAd = adSoyad.Split(' ')[0];
        var sozluk = SozlukYap(await _metin.TumunuGetirAsync(isletmeId, ct));
        var runtime = new Dictionary<string, string>(StringComparer.Ordinal) { ["alici_ad"] = aliciIlkAd };

        var markaAdi = await CozVeyaFallbackAsync(sozluk, AnahtarKodu.MarkaAdi,
            "Markanız", "davetiye", isletmeId, runtime, htmlEncode: false, ct);
        runtime["marka_adi"] = markaAdi;
        var imza = await CozVeyaFallbackAsync(sozluk, AnahtarKodu.MailImza,
            "", "davetiye", isletmeId, runtime, htmlEncode: false, ct);

        var konu = $"{markaAdi} ekibine eklendiniz";
        var html = MarkayaEklendiHtmlSablonu(aliciIlkAd, girisLink, imza, markaAdi);
        var replyTo = sozluk.GetValueOrDefault(AnahtarKodu.IletisimEmail);
        await GonderAsync(toEmail, adSoyad, konu, html, ct, replyTo, fromAdOverride: markaAdi);
    }

    // v19 B5 - davet maili onizleme: render mantigini reuse eder, gondermez. Yeni tenant icin
    // isletmeId=Guid.Empty (varsayilan metinler) + markaAdi override (kullanicinin girdigi marka).
    public async Task<string> DavetMailOnizleHtmlAsync(Guid isletmeId, string aliciAd, string? markaAdi, CancellationToken ct = default)
    {
        var (_, html, _, _) = await DavetMailRenderAsync(aliciAd, "#onizleme", isletmeId, ct, markaAdi);
        return html;
    }

    // Ortak davet maili render mantigi (gonder + onizleme paylasir; paralel yapi yok).
    private async Task<(string konu, string html, string? replyTo, string markaAdi)> DavetMailRenderAsync(
        string adSoyad, string link, Guid isletmeId, CancellationToken ct, string? markaAdiOverride = null)
    {
        var aliciIlkAd = adSoyad.Split(' ')[0];

        // Giris metni fallback'i (tenant mail_davetiye_giris_metni bos VE AnahtarKatalogu.Varsayilan bos ise).
        const string girisFallback =
            "Aşağıdaki butona tıklayarak hesabınızı oluşturabilir ve şifrenizi belirleyebilirsiniz. " +
            "Hesabınız hazır olduğunda e-posta adresiniz ve şifrenizle giriş yapabilirsiniz.";

        var sozluk = SozlukYap(await _metin.TumunuGetirAsync(isletmeId, ct));
        var runtime = new Dictionary<string, string>(StringComparer.Ordinal) { ["alici_ad"] = aliciIlkAd };

        // marka_adi'yi once coz (override > tenant metni > notr fallback) ve runtime'a ekle:
        // boylece konu + giris metni icindeki {marka_adi} placeholder'i da cozulur (defense in depth).
        var markaAdi = !string.IsNullOrWhiteSpace(markaAdiOverride)
            ? markaAdiOverride!
            : await CozVeyaFallbackAsync(sozluk, AnahtarKodu.MarkaAdi,
                "Markanız", "davetiye", isletmeId, runtime, htmlEncode: false, ct);
        runtime["marka_adi"] = markaAdi;

        var konu = await CozVeyaFallbackAsync(sozluk, AnahtarKodu.MailDavetiyeKonu,
            $"{aliciIlkAd}, hesap davetiyeniz", "davetiye", isletmeId, runtime, htmlEncode: false, ct);
        var girisMetni = await CozVeyaFallbackAsync(sozluk, AnahtarKodu.MailDavetiyeGirisMetni,
            girisFallback, "davetiye", isletmeId, runtime, htmlEncode: false, ct);
        var imza = await CozVeyaFallbackAsync(sozluk, AnahtarKodu.MailImza,
            "", "davetiye", isletmeId, runtime, htmlEncode: false, ct);

        var sayacAktif = sozluk.TryGetValue(AnahtarKodu.SayacAktif, out var saDeger) && saDeger == "true";
        var (sayacGecti, sayacGun) = MailSayac(sozluk.GetValueOrDefault(AnahtarKodu.SayacHedefTarihi));
        var sayacBaslik = sayacGecti
            ? sozluk.GetValueOrDefault(AnahtarKodu.SayacBittiCumle, "")
            : sozluk.GetValueOrDefault(AnahtarKodu.SayacAktifCumle, "");
        var sayacGoster = sayacAktif && !string.IsNullOrWhiteSpace(sayacBaslik);
        var sayacCumleHtml = sayacGoster
            ? $"{WebUtility.HtmlEncode(sayacBaslik)} <strong>{sayacGun} gün</strong>"
            : "";

        var html = DavetiyeHtmlSablonu(aliciIlkAd, link, sayacGoster, sayacCumleHtml, girisMetni, imza, markaAdi);
        return (konu, html, sozluk.GetValueOrDefault(AnahtarKodu.IletisimEmail), markaAdi);
    }

    public Task SifreSifirlamaMailGonderAsync(string toEmail, string adSoyad, string link, CancellationToken ct = default)
    {
        var ilkAd = adSoyad.Split(' ')[0];
        var konu = "Şifre Sıfırlama";
        var html = SifreSifirlamaHtmlSablonu(ilkAd, link);
        return GonderAsync(toEmail, adSoyad, konu, html, ct);
    }

    /// <summary>
    /// Hatırlatıcı maili — kısa + odaklı + brand tutarlı.
    /// </summary>
    public async Task HatirlaticiMailGonderAsync(string toEmail, string aliciAdSoyad, string notBaslik, string? notIcerik,
        string? klasorAdi, string kimeMetin, DateTimeOffset hatirlatmaZamani, Guid notId, Guid isletmeId, CancellationToken ct = default)
    {
        var aliciIlkAd = aliciAdSoyad.Split(' ')[0];
        var frontend = _cfg["FrontendBaseUrl"] ?? "https://notlar.dentlogicapp.com";
        var notLink = $"{frontend}/?focus={notId}";

        var sozluk = SozlukYap(await _metin.TumunuGetirAsync(isletmeId, ct));
        var runtime = new Dictionary<string, string>(StringComparer.Ordinal) { ["not_basligi"] = notBaslik };
        var konu = await CozVeyaFallbackAsync(sozluk, AnahtarKodu.MailHatirlatmaKonu,
            $"Hatırlatma — \"{notBaslik}\"", "hatirlatma", isletmeId, runtime, htmlEncode: false, ct);

        var html = HatirlaticiHtmlSablonu(aliciIlkAd, notBaslik, notIcerik, klasorAdi, kimeMetin, hatirlatmaZamani, notLink);
        await GonderAsync(toEmail, aliciAdSoyad, konu, html, ct, sozluk.GetValueOrDefault(AnahtarKodu.IletisimEmail));
    }

    // v19 B8 - operasyonel bildirim: tenant context yok, hazir (konu,html) tuple'i dogrudan gonderir.
    public Task OperasyonelMailGonderAsync(string toEmail, string toAd, (string Konu, string Html) icerik, CancellationToken ct = default)
        => GonderAsync(toEmail, toAd, icerik.Konu, icerik.Html, ct);

    private async Task GonderAsync(string toEmail, string toAd, string konu, string html, CancellationToken ct, string? replyTo = null, string? fromAdOverride = null)
    {
        var host = _cfg["Smtp:Host"] ?? "localhost";
        var port = int.Parse(_cfg["Smtp:Port"] ?? "1025");
        var user = _cfg["Smtp:User"];
        var pass = _cfg["Smtp:Pass"];
        var ssl = bool.Parse(_cfg["Smtp:Ssl"] ?? "false");
        var from = _cfg["Smtp:From"] ?? "notlar@local.test";
        // v19 - multitenant: davet/tenant maili tenant markasiyla gider (fromAdOverride); sistem maili config/Notlar
        var fromAd = !string.IsNullOrWhiteSpace(fromAdOverride) ? fromAdOverride! : (_cfg["Smtp:FromName"] ?? "Notlar");

        var msg = new MimeMessage();
        msg.From.Add(new MailboxAddress(fromAd, from));
        if (!string.IsNullOrWhiteSpace(replyTo) && MailboxAddress.TryParse(replyTo, out var rt))
            msg.ReplyTo.Add(rt);  // v18 Asama 17.1 - tenant iletisim_email; bos ise system default
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

    // v18 Paket2 - datetime-local ("YYYY-MM-DDTHH:mm") / date string -> (gecti, mutlak gun).
    // UTC varsayar (mail gun hassasiyeti); gecersiz/bos -> (false, 0). Gecince ileri (mutlak gun).
    private static (bool gecti, int gun) MailSayac(string? hedefTarih)
    {
        if (string.IsNullOrWhiteSpace(hedefTarih) ||
            !DateTime.TryParse(hedefTarih, System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal, out var hedef))
            return (false, 0);
        var fark = hedef - DateTime.UtcNow;
        return (fark.TotalSeconds <= 0, (int)Math.Floor(Math.Abs(fark.TotalDays)));
    }

    private static string DavetiyeHtmlSablonu(string aliciIlkAd, string link, bool sayacGoster, string sayacCumleHtml, string girisMetni, string mailImza, string markaAdi)
    {
        // v18 Paket2 - sayac cumlesi field'lerden (sayac_aktif_cumle/bitti_cumle) + ileri sayim;
        // hesaplama caller'da (MailSayac). Sayac kapali/bos ise blok hic basilmaz.
        var sayacBlok = sayacGoster
            ? $@"<p style='color:#5d4a37;font-size:15px;line-height:1.7;margin:0;text-align:center;'>{sayacCumleHtml}</p>"
            : "";

        // Madde tasarım disiplini: rozet (28x28 terracotta) + başlık + justify açıklama + ince dashed ayraç
        static string Madde(string rakam, string baslik, string aciklama, bool sonMu = false) => $@"
      <tr><td style='padding:22px 40px 0;'>
        <table role='presentation' cellpadding='0' cellspacing='0' border='0'>
          <tr>
            <td style='width:28px;height:28px;background:#c4704d;color:#ffffff;border-radius:8px;text-align:center;vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,""Segoe UI"",sans-serif;font-size:12px;font-weight:600;letter-spacing:0.04em;'>
              {rakam}
            </td>
            <td style='padding-left:14px;font-family:Georgia,""Times New Roman"",serif;font-size:16px;color:#3d2817;font-weight:600;'>
              {baslik}
            </td>
          </tr>
        </table>
        <p style='color:#5d4a37;font-size:14px;line-height:1.7;margin:10px 0 0;text-align:justify;hyphens:auto;'>
          {aciklama}
        </p>
      </td></tr>
      {(sonMu ? "" : @"<tr><td style='padding:22px 40px 0;'><div style='border-top:1px dashed #ebe3d4;'></div></td></tr>")}";

        return $@"<!DOCTYPE html>
<html lang='tr'>
<head>
<meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1'>
<title>{markaAdi}</title>
</head>
<body style='margin:0;padding:0;background:#faf6ef;font-family:-apple-system,BlinkMacSystemFont,""Segoe UI"",Roboto,sans-serif;color:#3d2817;'>
<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0' style='padding:32px 12px;background:#faf6ef;'>
  <tr><td align='center'>
    <table role='presentation' width='560' cellpadding='0' cellspacing='0' border='0' style='max-width:560px;background:#ffffff;border-radius:18px;border:1px solid #ebe3d4;overflow:hidden;'>

      <tr><td style='padding:40px 40px 8px;text-align:center;'>
        <div style='font-size:18px;color:#c4704d;line-height:1;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;'>{markaAdi}</div>
      </td></tr>

      <tr><td style='padding:8px 40px 0;text-align:center;'>
        <h1 style='font-family:Georgia,""Times New Roman"",serif;font-size:30px;color:#3d2817;margin:0 0 6px;font-weight:600;letter-spacing:-0.02em;'>
          {aliciIlkAd},
        </h1>
        <p style='color:#c4704d;font-size:14px;margin:0;font-style:italic;letter-spacing:0.04em;'>
          hesabınız hazır
        </p>
      </td></tr>

      <tr><td style='padding:28px 40px 0;'>
        <div style='color:#5d4a37;font-size:15px;line-height:1.7;margin:0 0 14px;text-align:justify;hyphens:auto;'>
          {girisMetni}
        </div>
        {sayacBlok}
      </td></tr>

      <tr><td style='padding:32px 40px 12px;text-align:center;'>
        <a href='{link}'
           style='display:inline-block;background:#3d2817;color:#faf6ef;padding:16px 36px;border-radius:10px;text-decoration:none;font-weight:500;font-size:15px;letter-spacing:0.01em;'>
          Hesabımı Aç ve Şifre Belirle
        </a>
        <p style='color:#9c8a73;font-size:12px;margin:14px 0 0;'>
          Bu bağlantı 24 saat geçerli.
        </p>
      </td></tr>

      <tr><td style='padding:32px 40px 8px;'>
        <table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0'>
          <tr>
            <td style='border-top:1px solid #ebe3d4;'></td>
            <td style='padding:0 14px;color:#c4704d;font-size:16px;'>·</td>
            <td style='border-top:1px solid #ebe3d4;'></td>
          </tr>
        </table>
      </td></tr>

      <tr><td style='padding:24px 40px 0;'>
        <h2 style='font-family:Georgia,""Times New Roman"",serif;font-size:20px;color:#3d2817;margin:0 0 6px;text-align:center;font-weight:600;'>
          İçeride seni neler bekliyor?
        </h2>
        <p style='color:#9c8a73;font-size:13px;margin:0;text-align:center;font-style:italic;'>
          Hızlı başlangıç rehberi
        </p>
      </td></tr>

      {Madde("01", "Giriş yapmak için",
        "Yukarıdaki butona tıklayıp kendi şifreni belirleyince hesabın hazır. Bir dahaki sefere sadece e-posta adresin ve şifrenle giriş yaparsın. Giriş ekranındaki <strong>“Beni hatırla”</strong> kutusunu işaretli bırakırsan her seferinde tekrar girmek zorunda kalmazsın.")}

      {Madde("02", "Aklına bir şey geldiğinde",
        "Ana sayfada <em>“Bir not düşün…”</em> yazan kutuyu göreceksin. Aklındakini yaz, sağdaki <strong>Ekle</strong> butonuna dokun, oldu. İstersen sadece bir başlık, istersen detaylı bir açıklama ekleyebilirsin.")}

      {Madde("03", "Bir işi tamamladığında",
        "Her notun yanında küçük bir kutucuk var. Ona tıkladığında <em>“Nasıl tamamlandı?”</em> diye sorulacak. Birkaç kelime yaz (örneğin: <em>“Rapor gönderildi, onay bekleniyor”</em>) ki sonradan dönüp ne yapıldığını hatırlayabilesin. Bu küçük detaylar ileride işine yarayacak.")}

      {Madde("04", "Bir notu güncellemek",
        "Her notun altında küçük ikonlar göreceksin: <strong>göz</strong> (detaylar), <strong>kalem</strong> (düzenle), <strong>çöp kutusu</strong> (sil). Kalem ikonuna tıklayıp başlığı, içeriği veya hangi klasöre ait olduğunu istediğin gibi değiştirebilirsin.")}

      {Madde("05", "Hatırlatıcı kurmak",
        "Bir işi unutmamak istersen kalem ikonuyla düzenle penceresini aç, en altta <strong>“Hatırlatıcı kur”</strong> seçeneğini göreceksin. Tarih ve saati seç, kime hatırlatılacağını ve nasıl bildirim alınacağını (uygulama içinde, e-postayla veya her ikisi) belirle. Zamanı geldiğinde hatırlatma gönderilir.")}

      {Madde("06", "Bir notun geçmişini görmek",
        "Aynı satırdaki <strong>göz</strong> ikonu, notun bütün geçmişini gösterir: ne zaman oluşturuldu, ne zaman ne değişti, kim ne yazdı, ne zaman tamamlandı… Hiçbir şey kaybolmaz; ekipteki herkes değişiklikleri görebilir.")}

      {Madde("07", "Konuları ayırmak için — klasörler",
        "Sol panelden <strong>“Yeni klasör”</strong> diyerek konuları gruplayabilirsin: <em>“Projeler”, “Toplantılar”, “Arşiv”</em> gibi. Notu eklerken veya düzenlerken hangi klasöre ait olduğunu seçebilirsin. İstersen bir klasörü sonradan silebilirsin — içindeki notlar kaybolmaz, sadece klasörsüz hâle gelir.", sonMu: true)}

      <tr><td style='padding:32px 40px 8px;'>
        <table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0'>
          <tr>
            <td style='border-top:1px solid #ebe3d4;'></td>
            <td style='padding:0 14px;color:#c4704d;font-size:16px;'>·</td>
            <td style='border-top:1px solid #ebe3d4;'></td>
          </tr>
        </table>
      </td></tr>

      <tr><td style='padding:20px 40px 0;'>
        <p style='color:#5d4a37;font-size:15px;line-height:1.7;margin:0;text-align:center;font-style:italic;'>
          Hadi başlayalım. İhtiyacın olan her şey içeride seni bekliyor.
        </p>
      </td></tr>

      <!-- Imza (v16 — tenant MailImza) -->
      <tr><td style='padding:20px 40px 0;text-align:center;'>
        <p style='color:#3d2817;font-size:14px;margin:0;'>
          <strong style='font-family:Georgia,""Times New Roman"",serif;color:#c4704d;font-size:16px;'>{WebUtility.HtmlEncode(mailImza)}</strong>
        </p>
      </td></tr>

      <!-- Footer (v16 — tenant MarkaAdi) -->
      <tr><td style='padding:32px 40px 32px;text-align:center;'>
        <p style='color:#9c8a73;font-size:11px;margin:0;line-height:1.6;'>
          {WebUtility.HtmlEncode(markaAdi)} · <a href='https://notlar.dentlogicapp.com' style='color:#9c8a73;text-decoration:none;'>notlar.dentlogicapp.com</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>";
    }

    // v19 bonus - mevcut kullanici bilgilendirme maili sablonu. Davetiye paletiyle tutarli (#faf6ef/#3d2817/#c4704d),
    // ama "sifre belirle" yerine "mevcut hesabinizla giris yapin" temasi (buton -> giris ekrani).
    private static string MarkayaEklendiHtmlSablonu(string aliciIlkAd, string girisLink, string mailImza, string markaAdi)
    {
        var imzaBlok = string.IsNullOrWhiteSpace(mailImza) ? "" : $@"
      <tr><td style='padding:20px 40px 0;text-align:center;'>
        <p style='color:#3d2817;font-size:14px;margin:0;'>
          <strong style='font-family:Georgia,""Times New Roman"",serif;color:#c4704d;font-size:16px;'>{WebUtility.HtmlEncode(mailImza)}</strong>
        </p>
      </td></tr>";

        return $@"<!DOCTYPE html>
<html lang='tr'>
<head>
<meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1'>
<title>{markaAdi}</title>
</head>
<body style='margin:0;padding:0;background:#faf6ef;font-family:-apple-system,BlinkMacSystemFont,""Segoe UI"",Roboto,sans-serif;color:#3d2817;'>
<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0' style='padding:32px 12px;background:#faf6ef;'>
  <tr><td align='center'>
    <table role='presentation' width='560' cellpadding='0' cellspacing='0' border='0' style='max-width:560px;background:#ffffff;border-radius:18px;border:1px solid #ebe3d4;overflow:hidden;'>

      <tr><td style='padding:40px 40px 8px;text-align:center;'>
        <div style='font-size:18px;color:#c4704d;line-height:1;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;'>{markaAdi}</div>
      </td></tr>

      <tr><td style='padding:8px 40px 0;text-align:center;'>
        <h1 style='font-family:Georgia,""Times New Roman"",serif;font-size:30px;color:#3d2817;margin:0 0 6px;font-weight:600;letter-spacing:-0.02em;'>
          {aliciIlkAd},
        </h1>
        <p style='color:#c4704d;font-size:14px;margin:0;font-style:italic;letter-spacing:0.04em;'>
          ekibe eklendiniz
        </p>
      </td></tr>

      <tr><td style='padding:28px 40px 0;'>
        <div style='color:#5d4a37;font-size:15px;line-height:1.7;margin:0;text-align:justify;hyphens:auto;'>
          <strong>{markaAdi}</strong> çalışma alanına eklendiniz. Zaten bir hesabınız olduğu için yeni bir şifre belirlemenize gerek yok. Mevcut e-posta adresiniz ve şifrenizle giriş yaparak bu çalışma alanına erişebilirsiniz.
        </div>
      </td></tr>

      <tr><td style='padding:32px 40px 12px;text-align:center;'>
        <a href='{girisLink}'
           style='display:inline-block;background:#3d2817;color:#faf6ef;padding:16px 36px;border-radius:10px;text-decoration:none;font-weight:500;font-size:15px;letter-spacing:0.01em;'>
          Giriş Yap
        </a>
      </td></tr>
      {imzaBlok}

      <tr><td style='padding:32px 40px 32px;text-align:center;'>
        <p style='color:#9c8a73;font-size:11px;margin:0;line-height:1.6;'>
          {WebUtility.HtmlEncode(markaAdi)} · <a href='https://notlar.dentlogicapp.com' style='color:#9c8a73;text-decoration:none;'>notlar.dentlogicapp.com</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>";
    }

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
        <div style='text-align:center;font-size:32px;color:#c4704d;margin-bottom:20px;line-height:1;'></div>
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
          <a href='https://notlar.dentlogicapp.com' style='color:#9c8a73;text-decoration:none;'>notlar.dentlogicapp.com</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>";
    }

    /// <summary>
    /// Hatırlatıcı maili — kısa odaklı kart + CTA, Davetiye gibi 7 maddeli uzun değil.
    /// </summary>
    private static string HatirlaticiHtmlSablonu(string aliciIlkAd, string notBaslik, string? notIcerik,
        string? klasorAdi, string kimeMetin, DateTimeOffset hatirlatmaZamani, string notLink)
    {
        // İçerik 400 karaktere kadar (önceki 200 çok azdı)
        var icerikKisa = string.IsNullOrWhiteSpace(notIcerik)
            ? ""
            : (notIcerik.Length > 400 ? notIcerik.Substring(0, 400) + "…" : notIcerik);

        // TR saat dilimi gösterimi
        var trZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul");
        var trZaman = TimeZoneInfo.ConvertTime(hatirlatmaZamani, trZone);
        var zamanMetni = trZaman.ToString("dd MMMM yyyy, HH:mm",
            System.Globalization.CultureInfo.GetCultureInfo("tr-TR"));

        var klasorPill = string.IsNullOrWhiteSpace(klasorAdi)
            ? ""
            : $@"<td style='padding-right:8px;'>
                  <span style='display:inline-block;background:#f5ede0;color:#8b6f4e;padding:6px 14px;border-radius:16px;font-size:12px;font-weight:500;'>
                    📁 {klasorAdi}
                  </span>
                </td>";

        var zamanPill = $@"<td>
              <span style='display:inline-block;background:#c4704d;color:#ffffff;padding:6px 14px;border-radius:16px;font-size:12px;font-weight:500;'>
                ⏰ {zamanMetni}
              </span>
            </td>";

        var icerikSatiri = string.IsNullOrWhiteSpace(icerikKisa)
            ? ""
            : $@"<p style='color:#5d4a37;font-size:14px;line-height:1.75;margin:14px 0 0;text-align:justify;hyphens:auto;'>
                  {System.Net.WebUtility.HtmlEncode(icerikKisa).Replace("\n", "<br>")}
                </p>";

        return $@"<!DOCTYPE html>
<html lang='tr'>
<head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'></head>
<body style='margin:0;padding:0;background:#faf6ef;font-family:-apple-system,BlinkMacSystemFont,""Segoe UI"",Roboto,sans-serif;color:#3d2817;'>
<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0' style='padding:32px 12px;background:#faf6ef;'>
  <tr><td align='center'>
    <table role='presentation' width='560' cellpadding='0' cellspacing='0' border='0' style='max-width:560px;background:#ffffff;border-radius:18px;border:1px solid #ebe3d4;overflow:hidden;'>

      <!-- Üst kalp -->
      <tr><td style='padding:40px 40px 12px;text-align:center;'>
        <div style='font-size:36px;color:#c4704d;line-height:1;'></div>
      </td></tr>

      <!-- Başlık -->
      <tr><td style='padding:8px 40px 0;text-align:center;'>
        <h1 style='font-family:Georgia,""Times New Roman"",serif;font-size:24px;color:#3d2817;margin:0 0 6px;font-weight:600;letter-spacing:-0.01em;line-height:1.3;'>
          {aliciIlkAd}, hatırlatıcının zamanı geldi
        </h1>
        <p style='color:#c4704d;font-size:13px;margin:0;font-style:italic;letter-spacing:0.04em;'>
          {kimeMetni(kimeMetin)}
        </p>
      </td></tr>

      <!-- İçerik kartı -->
      <tr><td style='padding:30px 40px 0;'>
        <div style='background:#faf6ef;border-radius:14px;border:1px solid #ebe3d4;padding:28px 28px 24px;'>
          <h2 style='font-family:Georgia,""Times New Roman"",serif;font-size:20px;color:#3d2817;margin:0;font-weight:600;line-height:1.4;letter-spacing:-0.01em;'>
            {System.Net.WebUtility.HtmlEncode(notBaslik)}
          </h2>
          <div style='width:36px;height:2px;background:#c4704d;margin:10px 0 0;'></div>
          {icerikSatiri}

          <!-- İki pill yan yana: klasör + zaman -->
          <table role='presentation' cellpadding='0' cellspacing='0' border='0' style='margin-top:20px;'>
            <tr>
              {klasorPill}
              {zamanPill}
            </tr>
          </table>
        </div>
      </td></tr>

      <!-- CTA buton -->
      <tr><td style='padding:32px 40px 12px;text-align:center;'>
        <a href='{notLink}'
           style='display:inline-block;background:#3d2817;color:#faf6ef;padding:16px 36px;border-radius:10px;text-decoration:none;font-weight:500;font-size:15px;letter-spacing:0.01em;'>
          Notu Defterimde Aç &nbsp;→
        </a>
      </td></tr>

      <!-- Ayırıcı -->
      <tr><td style='padding:28px 40px 8px;'>
        <table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0'>
          <tr>
            <td style='border-top:1px solid #ebe3d4;'></td>
            <td style='padding:0 14px;color:#c4704d;font-size:16px;'>·</td>
            <td style='border-top:1px solid #ebe3d4;'></td>
          </tr>
        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td style='padding:32px 40px 32px;text-align:center;'>
        <p style='color:#9c8a73;font-size:11px;margin:0;line-height:1.6;'>
          <a href='https://notlar.dentlogicapp.com' style='color:#9c8a73;text-decoration:none;'>notlar.dentlogicapp.com</a>
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>";
    }

    // Hatırlatma "kime" alt-metni — 4 doğru varyant
    private static string kimeMetni(string kime) => kime switch
    {
        "Sen kurdun · Sana hatırlatıldı" => kime,
        "Sen kurdun · Aşkına ve sana hatırlatıldı" => kime,
        "Aşkın kurdu · Sana hatırlatıldı" => kime,
        "Aşkın kurdu · Aşkına ve sana hatırlatıldı" => kime,
        _ => "Hatırlatıcı"
    };
}
