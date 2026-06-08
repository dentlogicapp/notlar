namespace Notlar.Api.Models.Sema;

// v18 Asama 11.9 - TEK DOGRULUK KAYNAGI (Single Source of Truth).
// Yeni anahtar = buraya satir + Version bump + deploy. DB (metin_anahtarlari)
// bu katalogdan startup'ta turetilir (AnahtarSyncService). Git history = surum audit'i.
public static class AnahtarKatalogu
{
    // SemVer: yeni anahtar -> minor (1.1.0); tip/limit breaking -> major (2.0.0);
    // dokumantasyon (etiket/yonlendirme/aciklama) -> patch (1.0.1).
    public const string Version = "1.0.0";

    public static readonly IReadOnlyList<AnahtarTanim> Tumu = new[]
    {
        // --- MARKA ---
        AnahtarTanim.Tanim("marka_adi")
            .Kategori(Kategori.Marka).Tip(AlanTipi.Baslik)
            .Etiket("Marka Adı")
            .Yonlendirme("Çalışma grubu, işletme veya etkinlik için kullanılacak ismi yazınız.")
            .Aciklama("Browser sekmesi, dashboard başlığı ve mail footer'da görünür.")
            .Zorunlu().Sira(10).Build(),

        AnahtarTanim.Tanim("marka_emoji")
            .Kategori(Kategori.Marka).Tip(AlanTipi.PlaceholderKisa)
            .Etiket("Marka Emojisi")
            .Yonlendirme("Markanı temsil eden tek bir emoji seç. (Örn: 🤍, 📚, ☕, 🏢)")
            .Aciklama("Browser sekmesi ve dashboard üst başlıkta marka adınla birlikte görünür.")
            .Sira(20).Build(),

        AnahtarTanim.Tanim("marka_ikon_seti")
            .Kategori(Kategori.Marka).Tip(AlanTipi.PlaceholderKisa)
            .Etiket("İkon Seti")
            .Yonlendirme("Dashboard ikonların tonu. (kalp / klasik / ekip / aile / tatil)")
            .Aciklama("Geri sayım ve karşılama widget'larında kullanılacak ikon stili.")
            .Sira(30).Deprecated().Build(),

        // --- DASHBOARD ---
        AnahtarTanim.Tanim("dashboard_karsilama_basligi")
            .Kategori(Kategori.Dashboard).Tip(AlanTipi.Baslik)
            .Placeholderlar("alici_ad")
            .Etiket("Dashboard Karşılama Başlığı")
            .Yonlendirme("Kullanıcılar siteye girince üstte gördüğü ana başlık. (Örn: 'Merhaba', 'Hoşgeldin', 'Selam Ekip')")
            .Aciklama("Her sayfada üst kısımda görünür.")
            .Zorunlu().Sira(100).Build(),

        AnahtarTanim.Tanim("dashboard_karsilama_alt_metin")
            .Kategori(Kategori.Dashboard).Tip(AlanTipi.Metin)
            .Etiket("Dashboard Karşılama Alt Metni")
            .Yonlendirme("Başlığın altında zarif bir cümle. (Örn: 'Bugün ne planlayalım?', 'Çalışmaya hazır mıyız?')")
            .Aciklama("Dashboard üstünde italik gri olarak görünür.")
            .Sira(110).Build(),

        AnahtarTanim.Tanim("not_form_placeholder")
            .Kategori(Kategori.Dashboard).Tip(AlanTipi.PlaceholderKisa)
            .Etiket("Not Ekleme Form İpucu")
            .Yonlendirme("Yeni not ekleme kutusunda kullanıcıya gösterilecek soluk ipucu. (Örn: 'Bir hatıra düşün...', 'Bir dosya notu ekle...', 'Bir menü fikri yaz...')")
            .Aciklama("Ana sayfada büyük not ekleme kutusunda görünür.")
            .Sira(120).Build(),

        // --- SAYAC ---
        AnahtarTanim.Tanim("sayac_aktif")
            .Kategori(Kategori.Sayac).Tip(AlanTipi.PlaceholderKisa)
            .Etiket("Sayaç Aktif")
            .Yonlendirme("Geri sayım widget'ı dashboard'da görünsün mü? (true / false)")
            .Aciklama("Sayaç kapalıysa hiç gösterilmez.")
            .Sira(200).Build(),

        AnahtarTanim.Tanim("sayac_aktif_cumle")
            .Kategori(Kategori.Sayac).Tip(AlanTipi.Metin)
            .Placeholderlar("kalan_gun", "kalan_saat")
            .Etiket("Sayaç Aktif Cümle")
            .Yonlendirme("Geri sayımda kalan süre öncesinde gösterilecek cümle. (Örn: 'Düğünümüze kaldı', 'Lansmana kaldı', 'Sınava kaldı')")
            .Aciklama("Hedef tarihe ne kadar kaldığını anlatır.")
            .Sira(210).Build(),

        AnahtarTanim.Tanim("sayac_bitti_cumle")
            .Kategori(Kategori.Sayac).Tip(AlanTipi.Metin)
            .Etiket("Sayaç Bitti Cümle")
            .Yonlendirme("Hedef tarih geldikten sonra gösterilecek cümle. (Örn: 'Bugün en güzel günümüz', 'Açılışımız oldu', 'Sınava girdik')")
            .Aciklama("Sayaç 0 olduğunda görünür.")
            .Sira(220).Build(),

        AnahtarTanim.Tanim("sayac_hedef_tarihi")
            .Kategori(Kategori.Sayac).Tip(AlanTipi.PlaceholderKisa)
            .Etiket("Sayaç Hedef Tarihi")
            .Yonlendirme("Geri sayımın yöneleceği tarih ve saat.")
            .Aciklama("Tarih ve saati seçin; sayaç bu ana kadar geri sayar.")
            .Sira(230).Build(),

        // --- MAIL ---
        AnahtarTanim.Tanim("mail_imza")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Metin)
            .Etiket("Mail İmzası")
            .Yonlendirme("Mail sonunda gösterilecek ve çalışmanızı en iyi açıklayacak imzanızı yazınız. (Örn: 'Bilgi Kitap Evi Çalışma Grup Yönetimi', 'Sevgilerle, Musa & Ayşegül', 'Saygılarımızla, Yıldız Hukuk Bürosu')")
            .Aciklama("Hatırlatıcı ve davet maillerinin sonunda görünür.")
            .Zorunlu().Sira(300).Build(),

        AnahtarTanim.Tanim("mail_tonu")
            .Kategori(Kategori.Mail).Tip(AlanTipi.PlaceholderKisa)
            .Etiket("Mail Tonu")
            .Yonlendirme("Mail metinlerinin genel tarzı. (Örn: samimi / profesyonel / resmi)")
            .Aciklama("Davetiye ve hatirlatma maillerinin genel tonu - AI yardimcisi onerileri ve ton sliderinin varsayilan degeri.")
            .Sira(305).Build(),

        AnahtarTanim.Tanim("mail_davetiye_konu")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Subject)
            .Placeholderlar("alici_ad", "marka_adi")
            .Etiket("Davet Maili Konusu")
            .Yonlendirme("Yeni kullanıcıya gönderilecek davet e-postasının konusu. {alici_ad} yazarsanız kullanıcının ilk adı otomatik gelir. (Örn: '{alici_ad}, planlama defterimiz seni bekliyor')")
            .Aciklama("E-posta inbox'unda subject olarak görünür. İlgi çekici ve kişisel tutun.")
            .Zorunlu().Sira(310).Build(),

        AnahtarTanim.Tanim("mail_davetiye_alt_baslik")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Metin)
            .Etiket("Davet Maili Alt Başlık")
            .Yonlendirme("Mail içinde isim altında italik gösterilecek kısa açıklama. (Örn: 'planlama defterimiz seni bekliyor 🤍', 'ekibe hoşgeldin', 'çalışma grubumuza katılım daveti')")
            .Aciklama("Mail içinde başlığın hemen altında küçük italik metin olarak görünür.")
            .Sira(320).Build(),

        AnahtarTanim.Tanim("mail_davetiye_giris_metni")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Body)
            .Placeholderlar("alici_ad", "marka_adi")
            .Etiket("Davet Maili Giriş Metni")
            .Yonlendirme("Mail'in üst kısmında kullanıcıya hitap eden açıklama paragraf. Markanı, neden davet ettiğini ve nasıl katkıda bulunabileceğini anlat.")
            .Aciklama("Mail içinde CTA butonundan önce görünür. 2-4 cümle önerilir.")
            .Zorunlu().Sira(330).Build(),

        AnahtarTanim.Tanim("mail_hatirlatma_konu")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Subject)
            .Placeholderlar("not_basligi", "kullanici_adi")
            .Etiket("Hatırlatıcı Maili Konusu")
            .Yonlendirme("Bir not için hatırlatıcı kurulduğunda gönderilecek mail'in konusu. (Örn: '♡ Hatırlatıcı - {not_basligi}', 'Hatırlatıyoruz: {not_basligi}')")
            .Aciklama("Hatırlatma zamanı geldiğinde gönderilen mail'in subject'i.")
            .Sira(340).Build(),

        // --- BILDIRIM ---
        AnahtarTanim.Tanim("bildirim_yeni_not_metin")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Metin)
            .Placeholderlar("kullanici_adi", "not_basligi")
            .Etiket("Yeni Not Bildirimi Metni")
            .Yonlendirme("Diğer kullanıcı yeni not eklediğinde in-app bildirim metni. (Örn: '{kullanici_adi} yeni bir not ekledi: {not_basligi}')")
            .Aciklama("Sağ üst köşede toast olarak görünür.")
            .Sira(400).Deprecated().Build(),

        AnahtarTanim.Tanim("bildirim_not_tamamlandi_metin")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Metin)
            .Etiket("Not Tamamlandı Bildirimi")
            .Yonlendirme("Bir not tamamlandığında gösterilecek bildirim. (Örn: '✓ {not_basligi} tamamlandı', '{kullanici_adi} tamamladı: {not_basligi}')")
            .Aciklama("İlgili kullanıcılara in-app + opsiyonel mail.")
            .Sira(410).Build(),

        AnahtarTanim.Tanim("bildirim_hatirlatici_metin")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Metin)
            .Etiket("Hatırlatıcı Bildirimi Metni")
            .Yonlendirme("Hatırlatıcı zamanı geldiğinde gösterilen bildirim. (Örn: '⏰ Hatırlatma: {not_basligi}', '{not_basligi} için bugün son gün')")
            .Aciklama("Tarih/saat geldiğinde in-app + mail.")
            .Sira(420).Build(),

        // --- FORM ---
        AnahtarTanim.Tanim("form_klasor_olustur_placeholder")
            .Kategori(Kategori.Form).Tip(AlanTipi.PlaceholderKisa)
            .Etiket("Klasör Oluştur Formu İpucu")
            .Yonlendirme("Yeni klasör oluşturma form alanı için soluk ipucu. (Örn: 'Yeni klasör adı...', 'Konu başlığı...', 'Proje adı yaz...')")
            .Aciklama("Sol panelden 'Yeni klasör' tıklandığında açılan formda görünür.")
            .Sira(500).Build(),

        AnahtarTanim.Tanim("form_giris_email_placeholder")
            .Kategori(Kategori.Form).Tip(AlanTipi.PlaceholderKisa)
            .Etiket("Giriş Formu E-posta İpucu")
            .Yonlendirme("Login sayfasında e-posta alanı için ipucu. (Örn: 'E-posta adresin', 'E-mail address', 'ornek@firma.com')")
            .Aciklama("Login sayfasında üst form alanında görünür.")
            .Sira(510).Build(),
    };
}
