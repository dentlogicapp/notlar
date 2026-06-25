namespace Notlar.Api.Models.Sema;

// v18 Asama 11.9 B1 - yazim-hatasiz anahtar referansi.
// Kod icinde "mail_davetiye_konu" string yerine AnahtarKodu.MailDavetiyeKonu kullanilir.
// Yanlis yazma -> compile error. Startup'ta AnahtarKatalogu ile cross-check edilir (sync assert).
public static class AnahtarKodu
{
    public const string MarkaAdi = "marka_adi";
    public const string MarkaEmoji = "marka_emoji";
    public const string MarkaIkonSeti = "marka_ikon_seti";
    public const string DashboardKarsilamaBasligi = "dashboard_karsilama_basligi";
    public const string DashboardKarsilamaAltMetin = "dashboard_karsilama_alt_metin";
    public const string NotFormPlaceholder = "not_form_placeholder";
    public const string SayacAktif = "sayac_aktif";
    public const string SayacAktifCumle = "sayac_aktif_cumle";
    public const string SayacBittiCumle = "sayac_bitti_cumle";
    public const string SayacHedefTarihi = "sayac_hedef_tarihi";
    public const string MailImza = "mail_imza";
    public const string MailTonu = "mail_tonu";
    public const string MailDavetiyeKonu = "mail_davetiye_konu";
    public const string MailDavetiyeAltBaslik = "mail_davetiye_alt_baslik";
    public const string MailDavetiyeGirisMetni = "mail_davetiye_giris_metni";
    public const string MailDavetiyeButon = "mail_davetiye_buton";
    public const string MailDavetiyeBaglantiNotu = "mail_davetiye_baglanti_notu";
    public const string MailDavetiyeRehberBaslik = "mail_davetiye_rehber_baslik";
    public const string MailDavetiyeRehberAltBaslik = "mail_davetiye_rehber_alt_baslik";
    public const string MailDavetiyeRehber = "mail_davetiye_rehber";
    public const string MailDavetiyeKapanis = "mail_davetiye_kapanis";
    public const string MailHatirlatmaKonu = "mail_hatirlatma_konu";
    public const string MailHatirlatmaGirisMetni = "mail_hatirlatma_giris_metni";
    public const string MailEklendiKonu = "mail_eklendi_konu";
    public const string MailEklendiGirisMetni = "mail_eklendi_giris_metni";
    public const string MailSifreKonu = "mail_sifre_konu";
    public const string MailSifreGirisMetni = "mail_sifre_giris_metni";
    public const string IletisimEmail = "iletisim_email";
    public const string BildirimYeniNotMetin = "bildirim_yeni_not_metin";
    public const string BildirimNotTamamlandiMetin = "bildirim_not_tamamlandi_metin";
    public const string BildirimHatirlaticiMetin = "bildirim_hatirlatici_metin";
    public const string FormKlasorOlusturPlaceholder = "form_klasor_olustur_placeholder";
    public const string FormGirisEmailPlaceholder = "form_giris_email_placeholder";

    // Startup self-check (B1): tum const'lar AnahtarKatalogu'nda tanimli olmali.
    public static IReadOnlyList<string> Tumu => new[]
    {
        MarkaAdi, MarkaEmoji, MarkaIkonSeti,
        DashboardKarsilamaBasligi, DashboardKarsilamaAltMetin, NotFormPlaceholder,
        SayacAktif, SayacAktifCumle, SayacBittiCumle, SayacHedefTarihi,
        MailImza, MailTonu, MailDavetiyeKonu, MailDavetiyeAltBaslik,
        MailDavetiyeGirisMetni, MailDavetiyeButon, MailDavetiyeBaglantiNotu,
        MailDavetiyeRehberBaslik, MailDavetiyeRehberAltBaslik, MailDavetiyeRehber,
        MailDavetiyeKapanis, MailHatirlatmaKonu, MailHatirlatmaGirisMetni,
        MailEklendiKonu, MailEklendiGirisMetni, MailSifreKonu, MailSifreGirisMetni,
        IletisimEmail,
        BildirimYeniNotMetin, BildirimNotTamamlandiMetin, BildirimHatirlaticiMetin,
        FormKlasorOlusturPlaceholder, FormGirisEmailPlaceholder,
    };
}
