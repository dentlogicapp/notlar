using System.Net;

namespace Notlar.Api.Services;

/// <summary>
/// v19 B8 — Super admin operasyonel bildirim template'leri.
///
/// SAHIPLIK AYRIMI (Asama 6 mimarisi, Secenek A):
///   - Tenant mailleri (davetiye / hatirlatma) = isletme_metinleri (tenant edit eder, kisisellestirilebilir).
///   - Operasyonel mailler (bu dosya)        = kod-bound sabit, sektor-bagimsiz, kisisellestirme YOK.
///
/// Bu mailler super admin'e gider (sistem bildirimi). Marka/tenant temasi kullanilmaz;
/// notr sistem temasi (slate/indigo) ile gonderilir. Tum dinamik deger HtmlEncode'lanir.
/// </summary>
public static class OperasyonelTemplate
{
    /// <summary>Ortak sade iskelet — sistem bildirimi (marka yok, notr tema).</summary>
    private static string Iskelet(string baslik, string govdeHtml, string? rozet = null)
    {
        var rozetHtml = string.IsNullOrEmpty(rozet)
            ? ""
            : $@"<div style='display:inline-block;padding:4px 12px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:16px;'>{WebUtility.HtmlEncode(rozet)}</div>";

        return $@"<!DOCTYPE html>
<html lang='tr'>
<head>
<meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1'>
<title>{WebUtility.HtmlEncode(baslik)}</title>
</head>
<body style='margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,""Segoe UI"",Roboto,sans-serif;color:#1e293b;'>
<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0' style='padding:32px 12px;background:#f1f5f9;'>
  <tr><td align='center'>
    <table role='presentation' width='520' cellpadding='0' cellspacing='0' border='0' style='max-width:520px;background:#ffffff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;'>
      <tr><td style='padding:32px 36px 0;'>
        {rozetHtml}
        <h1 style='font-size:20px;color:#0f172a;margin:0 0 4px;font-weight:700;letter-spacing:-0.01em;'>{WebUtility.HtmlEncode(baslik)}</h1>
      </td></tr>
      <tr><td style='padding:16px 36px 0;'>
        <div style='color:#475569;font-size:14px;line-height:1.7;'>{govdeHtml}</div>
      </td></tr>
      <tr><td style='padding:28px 36px 32px;'>
        <div style='border-top:1px solid #f1f5f9;padding-top:16px;'>
          <p style='color:#94a3b8;font-size:11px;margin:0;line-height:1.6;'>
            Bu otomatik bir sistem bildirimidir. Super admin paneli &middot;
            <a href='https://notlar.dentlogicapp.com/admin/sistem' style='color:#6366f1;text-decoration:none;'>yonetim panelini ac</a>
          </p>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>";
    }

    /// <summary>Satir helper — etiket + deger.</summary>
    private static string Satir(string etiket, string deger) => $@"
      <p style='margin:0 0 8px;'>
        <span style='color:#94a3b8;font-size:12px;'>{WebUtility.HtmlEncode(etiket)}:</span>
        <strong style='color:#1e293b;'>{WebUtility.HtmlEncode(deger)}</strong>
      </p>";

    public static (string Konu, string Html) TenantOlusturuldu(string markaAdi, string olusturanEmail)
    {
        var govde =
            "<p style='margin:0 0 14px;'>Sistemde yeni bir tenant olusturuldu.</p>"
            + Satir("Tenant", markaAdi)
            + Satir("Olusturan", olusturanEmail);
        return ($"Yeni tenant olusturuldu: {markaAdi}", Iskelet("Yeni tenant olusturuldu", govde, "Tenant"));
    }

    public static (string Konu, string Html) TenantPasiflestirildi(string markaAdi, string aktorEmail)
    {
        var govde =
            "<p style='margin:0 0 14px;'>Bir tenant pasiflestirildi. Uyeleri artik giris yapamaz.</p>"
            + Satir("Tenant", markaAdi)
            + Satir("Islemi yapan", aktorEmail);
        return ($"Tenant pasiflestirildi: {markaAdi}", Iskelet("Tenant pasiflestirildi", govde, "Durum"));
    }

    public static (string Konu, string Html) Inaktif30Gun(string markaAdi, int gun)
    {
        var govde =
            $"<p style='margin:0 0 14px;'>Bu tenant son <strong>{gun} gun</strong> icinde hicbir aktivite kaydetmedi (denetim gunlugu bos).</p>"
            + Satir("Tenant", markaAdi)
            + Satir("Hareketsiz sure", $"{gun} gun")
            + "<p style='margin:14px 0 0;color:#64748b;'>Tenant durumunu kontrol etmek isteyebilirsiniz.</p>";
        return ($"Hareketsiz tenant: {markaAdi}", Iskelet("Hareketsiz tenant uyarisi", govde, "Inaktif"));
    }

    public static (string Konu, string Html) SuperAdminAtandi(string atananEmail, string aktorEmail)
    {
        var govde =
            "<p style='margin:0 0 14px;'>Bir kullaniciya super admin yetkisi verildi.</p>"
            + Satir("Atanan", atananEmail)
            + Satir("Yetkiyi veren", aktorEmail);
        return ("Yeni super admin atandi", Iskelet("Yeni super admin atandi", govde, "Yetki"));
    }

    public static (string Konu, string Html) SuperAdminKaldirildi(string kaldirilanEmail, string aktorEmail)
    {
        var govde =
            "<p style='margin:0 0 14px;'>Bir kullanicidan super admin yetkisi kaldirildi.</p>"
            + Satir("Kaldirilan", kaldirilanEmail)
            + Satir("Islemi yapan", aktorEmail);
        return ("Super admin yetkisi kaldirildi", Iskelet("Super admin yetkisi kaldirildi", govde, "Yetki"));
    }
}
