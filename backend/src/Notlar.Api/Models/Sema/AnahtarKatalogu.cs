namespace Notlar.Api.Models.Sema;

// v18 Asama 11.9 - TEK DOGRULUK KAYNAGI (Single Source of Truth).
// Yeni anahtar = buraya satir + Version bump + deploy. DB (metin_anahtarlari)
// bu katalogdan startup'ta turetilir (AnahtarSyncService). Git history = surum audit'i.
public static class AnahtarKatalogu
{
    // SemVer: yeni anahtar -> minor (1.1.0); tip/limit breaking -> major (2.0.0);
    // dokumantasyon (etiket/yonlendirme/aciklama) -> patch (1.0.1).
    public const string Version = "1.6.0";

    public static readonly IReadOnlyList<AnahtarTanim> Tumu = new[]
    {
        // --- MARKA ---
        AnahtarTanim.Tanim("marka_adi")
            .Kategori(Kategori.Marka).Tip(AlanTipi.Baslik)
            .Etiket("Marka Adı")
            .Yonlendirme("Çalışma grubu, işletme veya etkinlik için kullanılacak ismi yazınız.")
            .Aciklama("Browser sekmesi, dashboard başlığı ve mail footer'da görünür.")
            .Zorunlu().Sira(10).Varsayilan("Markanız").Build(),

        AnahtarTanim.Tanim("marka_emoji")
            .Kategori(Kategori.Marka).Tip(AlanTipi.PlaceholderKisa)
            .Etiket("Marka Emojisi")
            .Yonlendirme("Markanı temsil eden tek bir emoji seç. (Örn: 🤍, 📚, ☕, 🏢)")
            .Aciklama("Browser sekmesi ve dashboard üst başlıkta marka adınla birlikte görünür.")
            .Sira(20).Varsayilan("🔔").Build(),

        AnahtarTanim.Tanim("marka_ikon_seti")
            .Kategori(Kategori.Marka).Tip(AlanTipi.PlaceholderKisa)
            .Etiket("İkon Seti")
            .Yonlendirme("Dashboard ikonların tonu. (kalp / klasik / ekip / aile / tatil)")
            .Aciklama("Geri sayım ve karşılama widget'larında kullanılacak ikon stili.")
            .Sira(30).Deprecated().Varsayilan("klasik").Build(),

        // --- DASHBOARD ---
        AnahtarTanim.Tanim("dashboard_karsilama_basligi")
            .Kategori(Kategori.Dashboard).Tip(AlanTipi.Baslik)
            .Placeholderlar("alici_ad")
            .Etiket("Dashboard Karşılama Başlığı")
            .Yonlendirme("Kullanıcılar siteye girince üstte gördüğü ana başlık. (Örn: 'Merhaba', 'Hoşgeldin', 'Selam Ekip')")
            .Aciklama("Her sayfada üst kısımda görünür.")
            .Zorunlu().Sira(100).Varsayilan("Hoş geldin").Build(),

        AnahtarTanim.Tanim("dashboard_karsilama_alt_metin")
            .Kategori(Kategori.Dashboard).Tip(AlanTipi.Metin)
            .Etiket("Dashboard Karşılama Alt Metni")
            .Yonlendirme("Başlığın altında zarif bir cümle. (Örn: 'Bugün ne planlayalım?', 'Çalışmaya hazır mıyız?')")
            .Aciklama("Dashboard üstünde italik gri olarak görünür.")
            .Sira(110).Varsayilan("Bugün ne planlayalım?").Build(),

        AnahtarTanim.Tanim("not_form_placeholder")
            .Kategori(Kategori.Dashboard).Tip(AlanTipi.PlaceholderKisa)
            .Etiket("Not Ekleme Form İpucu")
            .Yonlendirme("Yeni not ekleme kutusunda kullanıcıya gösterilecek soluk ipucu. (Örn: 'Bir hatıra düşün...', 'Bir dosya notu ekle...', 'Bir menü fikri yaz...')")
            .Aciklama("Ana sayfada büyük not ekleme kutusunda görünür.")
            .Sira(120).Varsayilan("Aklına geleni not al...").Build(),

        AnahtarTanim.Tanim("duyuru_form_placeholder")
            .Kategori(Kategori.Dashboard).Tip(AlanTipi.PlaceholderKisa)
            .Etiket("Duyuru Paylaş Form İpucu")
            .Yonlendirme("Yönetici duyuru kutusunda gösterilecek soluk ipucu. (Örn: 'Kullanıcılara göndermek için bir duyuru yaz...')")
            .Aciklama("Ana sayfada yalnızca yöneticilerin gördüğü duyuru paylaşma kutusunda görünür.")
            .Sira(130).Varsayilan("Kullanıcılara göndermek için bir duyuru yaz...").Build(),

        // --- SAYAC ---
        AnahtarTanim.Tanim("sayac_aktif")
            .Kategori(Kategori.Sayac).Tip(AlanTipi.PlaceholderKisa)
            .Etiket("Sayaç Aktif")
            .Yonlendirme("Geri sayım widget'ı dashboard'da görünsün mü? (true / false)")
            .Aciklama("Sayaç kapalıysa hiç gösterilmez.")
            .Sira(200).Varsayilan("false").Build(),

        AnahtarTanim.Tanim("sayac_aktif_cumle")
            .Kategori(Kategori.Sayac).Tip(AlanTipi.Metin)
            .Placeholderlar("kalan_gun", "kalan_saat")
            .Etiket("Sayaç Aktif Cümle")
            .Yonlendirme("Geri sayımda kalan süre öncesinde gösterilecek cümle. (Örn: 'Düğünümüze kaldı', 'Lansmana kaldı', 'Sınava kaldı')")
            .Aciklama("Hedef tarihe ne kadar kaldığını anlatır.")
            .Sira(210).Varsayilan("Hedefe kalan süre").Build(),

        AnahtarTanim.Tanim("sayac_bitti_cumle")
            .Kategori(Kategori.Sayac).Tip(AlanTipi.Metin)
            .Etiket("Sayaç Bitti Cümle")
            .Yonlendirme("Hedef tarih geldikten sonra gösterilecek cümle. (Örn: 'Bugün en güzel günümüz', 'Açılışımız oldu', 'Sınava girdik')")
            .Aciklama("Sayaç 0 olduğunda görünür.")
            .Sira(220).Varsayilan("Hedef tarihe ulaşıldı").Build(),

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
            .Zorunlu().Sira(300).Varsayilan("Saygılarımızla").Build(),

        AnahtarTanim.Tanim("hatirlatici_push_baslik")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Baslik)
            .Etiket("Hatırlatıcı - Başlık")
            .Yonlendirme("Bildirimin üst (kalın) satırı. Kısa tutun. Marka adı 'Planlama Defteri' otomatik eklenir.")
            .Aciklama("Hatırlatıcı zamanı geldiğinde gönderilen push bildiriminin başlığı.")
            .Sira(400).Varsayilan("Hatırlatma").Build(),

        AnahtarTanim.Tanim("hatirlatici_push_govde")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Metin)
            .Etiket("Hatırlatıcı - Metin")
            .Yonlendirme("Bildirimin mesaj satırı. {not_baslik} ilgili notun başlığıyla değişir.")
            .Aciklama("Push gövdesi; 'Planlama Defteri' satırı otomatik üstte yer alır, bu metin altına eklenir.")
            .Sira(410).Varsayilan("\"{not_baslik}\" notunun zamanı geldi. Hemen göz atmak için tıkla!").Build(),

        AnahtarTanim.Tanim("not_olusturuldu_push_baslik")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Baslik)
            .Etiket("Yeni Not Oluşturuldu - Başlık")
            .Yonlendirme("Ekipten biri yeni not eklediğinde diğer üyelere düşen bildirimin başlığı.")
            .Aciklama("İşlemi yapan kişi hariç tenant üyelerine gönderilir.")
            .Sira(420).Varsayilan("Yeni Not Oluşturuldu").Build(),

        AnahtarTanim.Tanim("not_olusturuldu_push_govde")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Metin)
            .Etiket("Yeni Not Oluşturuldu - Metin")
            .Yonlendirme("{not_baslik} notun başlığı, {kullanici_adi} notu oluşturan kişi ile değişir.")
            .Aciklama("Push gövdesi; 'Planlama Defteri' satırı otomatik üstte yer alır.")
            .Sira(430).Varsayilan("\"{not_baslik}\" başlıklı yeni not \"{kullanici_adi}\" tarafından oluşturuldu. Hemen göz atmak için tıkla!").Build(),

        AnahtarTanim.Tanim("not_guncellendi_push_baslik")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Baslik)
            .Etiket("Not Güncellendi - Başlık")
            .Yonlendirme("Ekipten biri bir notu güncellediğinde diğer üyelere düşen bildirimin başlığı.")
            .Aciklama("İşlemi yapan kişi hariç tenant üyelerine gönderilir.")
            .Sira(440).Varsayilan("Not Güncellendi").Build(),

        AnahtarTanim.Tanim("not_guncellendi_push_govde")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Metin)
            .Etiket("Not Güncellendi - Metin")
            .Yonlendirme("{not_baslik} notun başlığı, {kullanici_adi} güncelleyen kişi ile değişir.")
            .Aciklama("Push gövdesi; 'Planlama Defteri' satırı otomatik üstte yer alır.")
            .Sira(450).Varsayilan("\"{not_baslik}\" başlıklı not \"{kullanici_adi}\" tarafından güncellendi. Hemen göz atmak için tıkla!").Build(),

        AnahtarTanim.Tanim("not_tamamlandi_push_baslik")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Baslik)
            .Etiket("Not Tamamlandı - Başlık")
            .Yonlendirme("Ekipten biri bir notu tamamladığında diğer üyelere düşen bildirimin başlığı.")
            .Aciklama("İşlemi yapan kişi hariç tenant üyelerine gönderilir.")
            .Sira(460).Varsayilan("Not Tamamlandı").Build(),

        AnahtarTanim.Tanim("not_tamamlandi_push_govde")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Metin)
            .Etiket("Not Tamamlandı - Metin")
            .Yonlendirme("{not_baslik} notun başlığı, {kullanici_adi} tamamlayan kişi ile değişir.")
            .Aciklama("Push gövdesi; 'Planlama Defteri' satırı otomatik üstte yer alır.")
            .Sira(470).Varsayilan("\"{not_baslik}\" başlıklı not \"{kullanici_adi}\" tarafından tamamlandı. Hemen göz atmak için tıkla!").Build(),

        AnahtarTanim.Tanim("hatirlatici_alici_eklendi_push_baslik")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Baslik)
            .Etiket("Hatırlatıcıya Eklendin - Başlık")
            .Yonlendirme("Biri seni bir notun hatırlatıcı alıcısı yaptığında düşen bildirimin başlığı.")
            .Aciklama("Yalnızca yeni eklenen alıcılara gönderilir.")
            .Sira(480).Varsayilan("Hatırlatıcıya Eklendin").Build(),

        AnahtarTanim.Tanim("hatirlatici_alici_eklendi_push_govde")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Metin)
            .Etiket("Hatırlatıcıya Eklendin - Metin")
            .Yonlendirme("{not_baslik} notun başlığı, {kullanici_adi} seni ekleyen kişi ile değişir.")
            .Aciklama("Push gövdesi; 'Planlama Defteri' satırı otomatik üstte yer alır.")
            .Sira(490).Varsayilan("\"{not_baslik}\" notunun hatırlatıcısına \"{kullanici_adi}\" seni ekledi. Hemen göz atmak için tıkla!").Build(),

        AnahtarTanim.Tanim("uye_katildi_push_baslik")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Baslik)
            .Etiket("Yeni Üye Katıldı - Başlık")
            .Yonlendirme("Ekibe yeni bir üye eklendiğinde mevcut üyelere düşen bildirimin başlığı.")
            .Aciklama("Yeni katılan hariç tenant üyelerine gönderilir.")
            .Sira(500).Varsayilan("Yeni Üye Katıldı").Build(),

        AnahtarTanim.Tanim("uye_katildi_push_govde")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Metin)
            .Etiket("Yeni Üye Katıldı - Metin")
            .Yonlendirme("{kullanici_adi} ekibe katılan kişinin adı ile değişir.")
            .Aciklama("Push gövdesi; 'Planlama Defteri' satırı otomatik üstte yer alır.")
            .Sira(510).Varsayilan("\"{kullanici_adi}\" ekibe katıldı. Ekibimiz büyüyor!").Build(),

        AnahtarTanim.Tanim("duyuru_push_baslik")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Baslik)
            .Etiket("Duyuru Paylaşıldı - Başlık")
            .Yonlendirme("Yönetici duyuru paylaştığında alıcılara düşen bildirimin başlığı.")
            .Aciklama("Seçili alıcılara veya tüm üyelere gönderilir.")
            .Sira(520).Varsayilan("Duyuru Paylaşıldı").Build(),

        AnahtarTanim.Tanim("duyuru_push_govde")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Metin)
            .Etiket("Duyuru Paylaşıldı - Metin")
            .Yonlendirme("Duyuru bildiriminin mesaj satırı. Yönetici adı bilinçli olarak gizli tutulur.")
            .Aciklama("Push gövdesi; 'Planlama Defteri' satırı otomatik üstte yer alır.")
            .Sira(530).Varsayilan("'Bir yönetici' tarafından bir duyuru paylaşıldı. Hemen göz atmak için tıkla!").Build(),

        AnahtarTanim.Tanim("duyuru_yanit_push_baslik")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Baslik)
            .Etiket("Duyuruya Yanıt - Başlık")
            .Yonlendirme("Duyuru konuşmasına yanıt yazıldığında karşı tarafa düşen bildirimin başlığı.")
            .Aciklama("Alıcı yazarsa duyuru sahibine, sahibi yazarsa konuşmadaki üyelere gider.")
            .Sira(540).Varsayilan("Duyuruya Yanıt").Build(),

        AnahtarTanim.Tanim("duyuru_yanit_push_govde")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Metin)
            .Placeholderlar("kullanici_adi")
            .Etiket("Duyuruya Yanıt - Metin")
            .Yonlendirme("{kullanici_adi} yanıtı yazan kişi ile değişir.")
            .Aciklama("Push gövdesi; 'Planlama Defteri' satırı otomatik üstte yer alır.")
            .Sira(550).Varsayilan("\"{kullanici_adi}\" duyuru konuşmasına yanıt yazdı. Hemen göz atmak için tıkla!").Build(),

        AnahtarTanim.Tanim("mail_tonu")
            .Kategori(Kategori.Mail).Tip(AlanTipi.PlaceholderKisa)
            .Etiket("Mail Tonu")
            .Yonlendirme("Mail metinlerinin genel tarzı. (Örn: samimi / profesyonel / resmi)")
            .Aciklama("Davetiye ve hatirlatma maillerinin genel tonu - AI yardimcisi onerileri ve ton sliderinin varsayilan degeri.")
            .Sira(305).Varsayilan("profesyonel").Build(),

        AnahtarTanim.Tanim("mail_davetiye_konu")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Subject)
            .Placeholderlar("alici_ad", "marka_adi")
            .Etiket("Davet Maili Konusu")
            .Yonlendirme("Yeni kullanıcıya gönderilecek davet e-postasının konusu. {alici_ad} yazarsanız kullanıcının ilk adı otomatik gelir. (Örn: '{alici_ad}, planlama defterimiz seni bekliyor')")
            .Aciklama("E-posta inbox'unda subject olarak görünür. İlgi çekici ve kişisel tutun.")
            .Zorunlu().Sira(310).Varsayilan("{marka_adi} - Hesap davetiyeniz").Build(),

        AnahtarTanim.Tanim("mail_davetiye_alt_baslik")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Metin)
            .Etiket("Davet Maili Alt Başlık")
            .Yonlendirme("Mail içinde isim altında italik gösterilecek kısa açıklama. (Örn: 'planlama defterimiz seni bekliyor 🤍', 'ekibe hoşgeldin', 'çalışma grubumuza katılım daveti')")
            .Aciklama("Mail içinde başlığın hemen altında küçük italik metin olarak görünür.")
            .Sira(320).Varsayilan("Sisteme hoş geldiniz").Build(),

        AnahtarTanim.Tanim("mail_davetiye_giris_metni")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Body)
            .Placeholderlar("alici_ad", "marka_adi")
            .Etiket("Davet Maili Giriş Metni")
            .Yonlendirme("Mail'in üst kısmında kullanıcıya hitap eden açıklama paragraf. Markanı, neden davet ettiğini ve nasıl katkıda bulunabileceğini anlat.")
            .Aciklama("Mail içinde CTA butonundan önce görünür. 2-4 cümle önerilir.")
            .Zorunlu().Sira(330).Varsayilan("Aşağıdaki butona tıklayarak hesabınızı oluşturabilir ve şifrenizi belirleyebilirsiniz. Hesabınız hazır olduğunda e-posta adresiniz ve şifrenizle giriş yapabilirsiniz.").Build(),

        AnahtarTanim.Tanim("mail_davetiye_buton")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Metin)
            .Etiket("Davet Maili Buton Metni")
            .Yonlendirme("Davet mailindeki ana çağrı butonunun metni. (Örn: 'Hesabımı Aç', 'Hemen Başla', 'Davetimi Kabul Et')")
            .Aciklama("Mailin ortasındaki büyük butonun üzerinde görünür.")
            .Sira(331).Varsayilan("Hesabımı Aç ve Şifre Belirle").Build(),

        AnahtarTanim.Tanim("mail_davetiye_baglanti_notu")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Metin)
            .Etiket("Davet Maili Bağlantı Notu")
            .Yonlendirme("Butonun altındaki küçük bilgi notu. (Örn: 'Bu bağlantı 24 saat geçerli.')")
            .Aciklama("Buton geçerlilik süresi gibi kısa bilgileri belirtir.")
            .Sira(332).Varsayilan("Bu bağlantı 24 saat geçerli.").Build(),

        AnahtarTanim.Tanim("mail_davetiye_rehber_baslik")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Metin)
            .Etiket("Davet Maili Rehber Başlığı")
            .Yonlendirme("Rehber bölümünün ana başlığı. (Örn: 'İçeride seni neler bekliyor?')")
            .Aciklama("Rehber maddelerinin üstündeki büyük başlık.")
            .Sira(333).Varsayilan("İçeride seni neler bekliyor?").Build(),

        AnahtarTanim.Tanim("mail_davetiye_rehber_alt_baslik")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Metin)
            .Etiket("Davet Maili Rehber Alt Başlığı")
            .Yonlendirme("Rehber başlığının altındaki italik açıklama. (Örn: 'Hızlı başlangıç rehberi')")
            .Aciklama("Rehber başlığının hemen altında küçük italik metin.")
            .Sira(334).Varsayilan("Hızlı başlangıç rehberi").Build(),

        AnahtarTanim.Tanim("mail_davetiye_rehber")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Body)
            .Etiket("Davet Maili Rehber İçeriği")
            .Yonlendirme("Yeni kullanıcıya gösterilen adım adım başlangıç rehberi. Boş bırakılırsa varsayılan 6 maddelik rehber kullanılır.")
            .Aciklama("Mailin alt bölümündeki numaralı rehber. Boş = sistemin hazır 6 maddelik rehberi.")
            .Sira(335).Build(),

        AnahtarTanim.Tanim("mail_davetiye_kapanis")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Metin)
            .Etiket("Davet Maili Kapanış Cümlesi")
            .Yonlendirme("Rehberin altındaki italik kapanış cümlesi. (Örn: 'Hadi başlayalım. İhtiyacın olan her şey içeride seni bekliyor.')")
            .Aciklama("İmzanın hemen üstünde, motive edici son cümle.")
            .Sira(336).Varsayilan("Hadi başlayalım. İhtiyacın olan her şey içeride seni bekliyor.").Build(),

        AnahtarTanim.Tanim("mail_hatirlatma_konu")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Subject)
            .Placeholderlar("not_basligi", "kullanici_adi")
            .Etiket("Hatırlatıcı Maili Konusu")
            .Yonlendirme("Bir not için hatırlatıcı kurulduğunda gönderilecek mail'in konusu. (Örn: '♡ Hatırlatıcı - {not_basligi}', 'Hatırlatıyoruz: {not_basligi}')")
            .Aciklama("Hatırlatma zamanı geldiğinde gönderilen mail'in subject'i.")
            .Sira(340).Deprecated().Varsayilan("Hatırlatma: {not_basligi}").Build(),

        AnahtarTanim.Tanim("mail_hatirlatma_giris_metni")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Body)
            .Placeholderlar("not_basligi", "kullanici_adi")
            .Etiket("Hatırlatıcı Maili Giriş Metni")
            .Yonlendirme("Hatırlatma mailinin üst kısmında, not detayından önce gösterilecek açıklama. (Örn: 'Kurduğun hatırlatmanın zamanı geldi 🤍')")
            .Aciklama("Hatırlatma mailinde not başlığından önce görünür. Boş bırakılırsa varsayılan kullanılır.")
            .Sira(341).Deprecated().Varsayilan("Hatırlatmanın zamanı geldi.").Build(),

        AnahtarTanim.Tanim("mail_hatirlatma_alt_baslik")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Metin)
            .Placeholderlar("alici_ad")
            .Etiket("Hatırlatıcı Maili Alt Başlığı")
            .Yonlendirme("Başlıkta alıcının adından sonra gelen ifade. (Örn: 'hatırlatıcının zamanı geldi')")
            .Aciklama("Mailin başlığında 'Ad, ...' biçiminde alıcı adından sonra görünür.")
            .Sira(342).Deprecated().Varsayilan("hatırlatıcının zamanı geldi").Build(),

        AnahtarTanim.Tanim("mail_hatirlatma_buton")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Metin)
            .Etiket("Hatırlatıcı Maili Buton Metni")
            .Yonlendirme("Nota gitme butonunun metni. (Örn: 'Notu Defterimde Aç', 'Nota Git')")
            .Aciklama("Mailin altındaki butonun üzerinde görünür (ok işareti otomatik eklenir).")
            .Sira(343).Deprecated().Varsayilan("Notu Defterimde Aç").Build(),

        AnahtarTanim.Tanim("mail_eklendi_konu")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Subject)
            .Placeholderlar("alici_ad", "marka_adi")
            .Etiket("Markaya Eklendi Maili Konusu")
            .Yonlendirme("Hesabı zaten olan bir kullanıcı yeni bir markaya eklendiğinde gönderilen mail'in konusu. (Örn: '{marka_adi} ekibine eklendin')")
            .Aciklama("Mevcut hesap bir tenant'a üye yapıldığında gönderilir.")
            .Sira(342).Varsayilan("{marka_adi} ekibine eklendin").Build(),

        AnahtarTanim.Tanim("mail_eklendi_giris_metni")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Body)
            .Placeholderlar("alici_ad", "marka_adi")
            .Etiket("Markaya Eklendi Maili Giriş Metni")
            .Yonlendirme("Kullanıcıya neden eklendiğini ve nasıl giriş yapacağını anlatan paragraf.")
            .Aciklama("Markaya eklendi mailinde giriş butonundan önce görünür.")
            .Sira(343).Varsayilan("Hesabınla artık bu markaya da erişebilirsin.").Build(),

        AnahtarTanim.Tanim("mail_eklendi_alt_baslik")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Metin)
            .Etiket("Markaya Eklendi Maili Alt Başlığı")
            .Yonlendirme("Başlığın altındaki italik kısa ifade. (Örn: 'ekibe eklendiniz', 'aramıza hoş geldin')")
            .Aciklama("Alıcının adının hemen altında görünür.")
            .Sira(344).Varsayilan("ekibe eklendiniz").Build(),

        AnahtarTanim.Tanim("mail_eklendi_buton")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Metin)
            .Etiket("Markaya Eklendi Maili Buton Metni")
            .Yonlendirme("Giriş butonunun metni. (Örn: 'Giriş Yap', 'Hemen Başla')")
            .Aciklama("Mailin ortasındaki butonun üzerinde görünür.")
            .Sira(345).Varsayilan("Giriş Yap").Build(),

        AnahtarTanim.Tanim("mail_sifre_konu")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Subject)
            .Placeholderlar("alici_ad")
            .Etiket("Şifre Sıfırlama Maili Konusu")
            .Yonlendirme("Şifre sıfırlama talebinde gönderilen mail'in konusu. (Örn: 'Şifre sıfırlama bağlantın')")
            .Aciklama("Kullanıcı şifresini sıfırlamak istediğinde gönderilir.")
            .Sira(344).Varsayilan("Şifre sıfırlama bağlantın").Build(),

        AnahtarTanim.Tanim("mail_sifre_giris_metni")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Body)
            .Placeholderlar("alici_ad")
            .Etiket("Şifre Sıfırlama Maili Giriş Metni")
            .Yonlendirme("Şifre sıfırlama mailinde butondan önce gösterilecek açıklama. Geçerlilik süresi vb. burada belirtilebilir.")
            .Aciklama("Sıfırlama bağlantısı butonundan önce görünür.")
            .Sira(345).Varsayilan("Şifreni sıfırlamak için aşağıdaki bağlantıyı kullan.").Build(),

        AnahtarTanim.Tanim("mail_sifre_baslik")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Metin)
            .Etiket("Şifre Sıfırlama Maili Başlığı")
            .Yonlendirme("Mailin en üstündeki büyük başlık. (Örn: 'Şifre sıfırlama isteği', 'Şifreni mi unuttun?')")
            .Aciklama("Mailin ortasındaki büyük başlık metni.")
            .Sira(346).Varsayilan("Şifre sıfırlama isteği").Build(),

        AnahtarTanim.Tanim("mail_sifre_buton")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Metin)
            .Etiket("Şifre Sıfırlama Maili Buton Metni")
            .Yonlendirme("Şifre belirleme butonunun metni. (Örn: 'Yeni Şifre Belirle', 'Şifremi Sıfırla')")
            .Aciklama("Sıfırlama bağlantısı butonunun üzerinde görünür.")
            .Sira(347).Varsayilan("Yeni Şifre Belirle").Build(),

        AnahtarTanim.Tanim("mail_sifre_not")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Metin)
            .Etiket("Şifre Sıfırlama Maili Güvenlik Notu")
            .Yonlendirme("Butonun altındaki güvenlik açıklaması. (Örn: 'Bu isteği sen yapmadıysan bu maili görmezden gelebilirsin.')")
            .Aciklama("Talebi yapmayan kullanıcıyı rahatlatan kısa not.")
            .Sira(348).Varsayilan("Bu isteği sen yapmadıysan bu maili görmezden gelebilirsin. Hesabın güvende, şifren değişmez.").Build(),

        AnahtarTanim.Tanim("iletisim_email")
            .Kategori(Kategori.Mail).Tip(AlanTipi.Subject)
            .Limit(120).Kapsam(KapsamTipi.Tenant)
            .Etiket("İletişim Email Adresi")
            .Yonlendirme("Müşterileriniz mailinize yanıt verdiğinde size hangi adrese gelsin?")
            .Aciklama("Mail Reply-To alanı olarak kullanılır. Boş bırakırsanız sistem varsayılanına gider.")
            .Zorunlu().Sira(350).Build(),

        // --- BILDIRIM ---
        AnahtarTanim.Tanim("bildirim_yeni_not_metin")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Metin)
            .Placeholderlar("kullanici_adi", "not_basligi")
            .Etiket("Yeni Not Bildirimi Metni")
            .Yonlendirme("Diğer kullanıcı yeni not eklediğinde in-app bildirim metni. (Örn: '{kullanici_adi} yeni bir not ekledi: {not_basligi}')")
            .Aciklama("Sağ üst köşede toast olarak görünür.")
            .Sira(400).Deprecated().Kapsam(KapsamTipi.Sistem).Build(),

        AnahtarTanim.Tanim("bildirim_not_tamamlandi_metin")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Metin)
            .Placeholderlar("not_basligi")
            .Etiket("Not Tamamlandı Bildirimi")
            .Yonlendirme("Bir not tamamlandığında gösterilecek bildirim. (Örn: '✓ {not_basligi} tamamlandı', '{kullanici_adi} tamamladı: {not_basligi}')")
            .Aciklama("İlgili kullanıcılara in-app + opsiyonel mail.")
            .Varsayilan("{not_basligi} tamamlandı")
            .Sira(410).Kapsam(KapsamTipi.Sistem).Build(),

        AnahtarTanim.Tanim("bildirim_hatirlatici_metin")
            .Kategori(Kategori.Bildirim).Tip(AlanTipi.Metin)
            .Placeholderlar("not_basligi")
            .Etiket("Hatırlatıcı Bildirimi Metni")
            .Yonlendirme("Hatırlatıcı zamanı geldiğinde gösterilen bildirim. (Örn: '⏰ Hatırlatma: {not_basligi}', '{not_basligi} için bugün son gün')")
            .Aciklama("Tarih/saat geldiğinde in-app + mail.")
            .Varsayilan("Hatırlatma: {not_basligi}")
            .Sira(420).Kapsam(KapsamTipi.Sistem).Build(),

        // --- FORM ---
        AnahtarTanim.Tanim("form_klasor_olustur_placeholder")
            .Kategori(Kategori.Form).Tip(AlanTipi.PlaceholderKisa)
            .Etiket("Klasör Oluştur Formu İpucu")
            .Yonlendirme("Yeni klasör oluşturma form alanı için soluk ipucu. (Örn: 'Yeni klasör adı...', 'Konu başlığı...', 'Proje adı yaz...')")
            .Aciklama("Sol panelden 'Yeni klasör' tıklandığında açılan formda görünür.")
            .Varsayilan("Yeni klasör adı...")
            .Sira(500).Kapsam(KapsamTipi.Sistem).Build(),

        AnahtarTanim.Tanim("form_giris_email_placeholder")
            .Kategori(Kategori.Form).Tip(AlanTipi.PlaceholderKisa)
            .Etiket("Giriş Formu E-posta İpucu")
            .Yonlendirme("Login sayfasında e-posta alanı için ipucu. (Örn: 'E-posta adresin', 'E-mail address', 'ornek@firma.com')")
            .Aciklama("Login sayfasında üst form alanında görünür.")
            .Varsayilan("ornek@eposta.com")
            .Sira(510).Kapsam(KapsamTipi.Sistem).Build(),
    };
}
