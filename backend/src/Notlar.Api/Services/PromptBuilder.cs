using System.Text;

namespace Notlar.Api.Services;

/// <summary>
/// v17 - AI prompt uretici (spec Bolum 6.6 birebir). Tum promptlar JSON mode garantili.
/// </summary>
public static class PromptBuilder
{
    public static string SystemMesaji() =>
        "Sen Türkçe metin yardımcısısın. Bir SaaS platformu için tenant yöneticisinin " +
        "doldurması gereken metin alanına 3 farklı öneri üreteceksin. Yanıtını mutlaka " +
        "geçerli JSON formatında ver: {\"oneriler\": [\"...\", \"...\", \"...\"]}";

    public static string TaslakOner(string anahtar, AiTaslakBaglam baglam)
    {
        if (baglam.Mod == "dokumantasyon")
            return DokumantasyonOner(anahtar, baglam);

        var sb = new StringBuilder();
        sb.AppendLine($"Anahtar: {anahtar}");
        sb.AppendLine($"Etiket: {baglam.Etiket}");
        sb.AppendLine($"Açıklama: {baglam.Aciklama ?? "-"}");
        sb.AppendLine($"Desteklenen placeholder'lar: {string.Join(", ", baglam.Placeholderlar)}");
        sb.AppendLine();
        sb.AppendLine("Tenant bağlamı:");
        sb.AppendLine($"- Marka: {baglam.MarkaAdi}");
        sb.AppendLine($"- Etkinlik/iş tipi: {baglam.EtkinlikTanimi ?? "-"}");
        sb.AppendLine($"- İstenen ton: {baglam.Ton}");
        sb.AppendLine($"- İstenen uzunluk: {baglam.Uzunluk ?? "-"}");
        var digerler = baglam.DigerMetinler is { Count: > 0 }
            ? string.Join(" | ", baglam.DigerMetinler) : "-";
        sb.AppendLine($"- Diğer dolu metinler (tutarlılık için): {digerler}");
        sb.AppendLine();
        sb.AppendLine("Kurallar:");
        sb.AppendLine("1. Tam olarak 3 öneri üret");
        sb.AppendLine("2. Placeholder'ları olduğu gibi koru: {{alici_ad}} -> {{alici_ad}}");
        sb.AppendLine("3. Tenant tonuna uygun yaz (samimi/resmi)");
        sb.AppendLine("4. Tip'e göre maksimum karakter:");
        sb.AppendLine("   - subject: 50 karakter");
        sb.AppendLine("   - baslik: 60 karakter");
        sb.AppendLine("   - metin: 150 karakter");
        sb.AppendLine("   - body: 500 karakter");
        sb.AppendLine("   - placeholder_kisa: 80 karakter");
        return sb.ToString();
    }

    // v18 Asama 11.6 - Super admin icin SISTEM DOKUMANTASYONU onerisi (tenant metni DEGIL).
    // HedefAlan: "yonlendirme" (input placeholder/ipucu) veya "aciklama" (form alti yardim).
    private static string DokumantasyonOner(string anahtarKodu, AiTaslakBaglam baglam)
    {
        var aciklamaMi = baglam.HedefAlan == "aciklama";
        var sb = new StringBuilder();
        sb.AppendLine("ÖNEMLİ: Bu bir SaaS platformunun SİSTEM DOKÜMANTASYONUDUR, tenant metni DEĞİL.");
        sb.AppendLine("Platformun süper yöneticisine yardım ediyorsun. Aşağıdaki metin anahtarı için " + (aciklamaMi
            ? "form altında gösterilecek kısa YARDIM AÇIKLAMASI yaz (tenant yöneticisine ne doldurması gerektiğini anlatan)."
            : "input alanında gösterilecek YÖNLENDİRME/PLACEHOLDER metni yaz (tenant yöneticisine örnek/ipucu veren)."));
        sb.AppendLine();
        sb.AppendLine($"Anahtar kodu: {anahtarKodu}");
        sb.AppendLine($"Etiket: {baglam.Etiket}");
        sb.AppendLine($"Tip: {baglam.Tip ?? "-"}");
        sb.AppendLine($"Kategori: {baglam.Kategori ?? "-"}");
        sb.AppendLine();
        sb.AppendLine("Kurallar:");
        sb.AppendLine("1. Tam olarak 3 öneri üret.");
        sb.AppendLine(aciklamaMi
            ? "2. Her öneri kısa bir yardım cümlesi olsun (maks 120 karakter), ne doldurulacağını açıklasın."
            : "2. Her öneri somut bir örnek/ipucu olsun (maks 80 karakter), farklı sektörlerden ilham versin (düğün, klinik, ekip vb.).");
        sb.AppendLine("3. Türkçe, açık ve eyleme yönelik yaz.");
        sb.AppendLine("4. Örneklerde {{alici_ad}} gibi placeholder gösterimini koru.");
        return sb.ToString();
    }

    public static string YenidenYaz(string mevcut, AiYenidenYazModu modu)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Sen Türkçe metin yardımcısısın. Aşağıdaki mevcut metni \"{modu}\" tarzında yeniden yaz.");
        sb.AppendLine();
        sb.AppendLine($"Mevcut metin: \"{mevcut}\"");
        sb.AppendLine();
        sb.AppendLine("Modlar:");
        sb.AppendLine("- daha_samimi: Daha sıcak, kişisel, arkadaşça ton");
        sb.AppendLine("- daha_resmi: Daha mesleki, saygılı, kurumsal ton");
        sb.AppendLine("- daha_kisa: Aynı mesajı daha az kelimeyle ifade et");
        sb.AppendLine("- daha_uzun: Daha detaylı açıklayarak genişlet");
        sb.AppendLine("- daha_eglenceli: Hafif, espirili, yaratıcı ton");
        sb.AppendLine();
        sb.AppendLine("Placeholder'ları koru. JSON formatında 3 öneri dön: {\"oneriler\": [\"...\", \"...\", \"...\"]}");
        return sb.ToString();
    }

    public static string TutarlilikKontrol(string tenantMetinleri)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Aşağıda bir tenant'ın doldurmuş olduğu sistem metinleri var. Marka tonu açısından tutarlılığı değerlendir.");
        sb.AppendLine();
        sb.AppendLine("Metinler:");
        sb.AppendLine(tenantMetinleri);
        sb.AppendLine();
        sb.AppendLine("Değerlendirme kriterleri:");
        sb.AppendLine("1. Genel ton (samimi/resmi/eğlenceli) tüm metinlerde tutarlı mı?");
        sb.AppendLine("2. Yazım stili (kişi tercihi, hitap şekli) tutarlı mı?");
        sb.AppendLine("3. Tutarsız bulduğun her metin için öneri sun.");
        sb.AppendLine();
        sb.AppendLine("Yanıt JSON: {\"skor\": 7.2, \"tutarli\": false, \"sorunlar\": [{\"anahtar\": \"...\", \"mevcut\": \"...\", \"sorun\": \"...\", \"oneri\": \"...\"}]}");
        return sb.ToString();
    }

    // v19 - Serbest prompt ile mail metni uretimi (Inline AI Compose).
    // DIGER promptlardan farkli: JSON DEGIL duz metin doner (streaming B1 ile token token akar,
    // tek oneri olarak diff onizlemeye B3 gider). System mesaji cikti disiplinini dayatir.
    public static string SerbestUretSistem() =>
        "Sen Türkçe mail metni yazarsın. Bir SaaS platformunun süper yöneticisi için mail içeriği " +
        "üretiyorsun. SADECE istenen metni üret: açıklama ekleme, başlık koyma, tırnak içine alma, " +
        "JSON kullanma. Çıktın doğrudan mail alanına yapıştırılabilecek temiz bir metin olmalı. " +
        "Placeholder'ları ({{alici_ad}} gibi) olduğu gibi koru.";

    public static string SerbestUret(SerbestUretBaglam b)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Aşağıdaki mail alanı için metin üret:");
        sb.AppendLine($"- Alan: {b.Etiket} ({b.Tip})");
        if (!string.IsNullOrWhiteSpace(b.Yonlendirme))
            sb.AppendLine($"- Alanın amacı: {b.Yonlendirme}");
        sb.AppendLine($"- Marka: {b.MarkaAdi}");
        if (!string.IsNullOrWhiteSpace(b.Ton))
            sb.AppendLine($"- Ton: {b.Ton}");
        if (!string.IsNullOrWhiteSpace(b.Uzunluk))
            sb.AppendLine($"- Uzunluk: {b.Uzunluk}");
        if (!string.IsNullOrWhiteSpace(b.MevcutMetin))
        {
            sb.AppendLine();
            sb.AppendLine($"Mevcut metin (isteğe göre geliştir veya değiştir): \"{b.MevcutMetin}\"");
        }
        if (b.Anahtar.StartsWith("mail_"))
        {
            sb.AppendLine();
            sb.AppendLine("ÖNEMLİ: Hitap satırı (örn. \"Merhaba {{alici_ad}},\") ve imza bloğu (örn. \"Saygılarımla, ... Ekibi\") EKLEME.");
            sb.AppendLine("Bunlar mail şablonunda otomatik bulunur; tekrar yazarsan mailde çift görünür. SADECE gövde içeriğini üret.");
        }
        sb.AppendLine();
        sb.AppendLine($"İstek: {b.Prompt}");
        sb.AppendLine();
        sb.AppendLine("Karakter sınırı:");
        sb.AppendLine("- subject (konu): en fazla 80 karakter, tek satır");
        sb.AppendLine("- body (gövde): en fazla 800 karakter");
        sb.AppendLine();
        sb.AppendLine("Sadece metni döndür, başka hiçbir şey yazma.");
        return sb.ToString();
    }
}