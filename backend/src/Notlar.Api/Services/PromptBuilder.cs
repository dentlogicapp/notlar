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
}