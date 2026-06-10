namespace Notlar.Api.Models.Sema;

// v18 Asama 11.9 - immutable anahtar tanimi (katalog ogesi).
// Sema = kod; DB bu tanimdan turetilir.
public sealed record AnahtarTanim(
    string Anahtar,
    Kategori Kategori,
    AlanTipi Tip,
    string Etiket,
    string Yonlendirme,
    string Aciklama,
    IReadOnlyList<string> Placeholderlar,
    bool Zorunlu,
    int Sira,
    bool Deprecated,
    int? KarakterLimiti,
    KapsamTipi Kapsam)
{
    // Efektif limit: ozel limit set edilmisse o, yoksa tipten gelen default.
    public int EfektifLimit => KarakterLimiti ?? TipDefault.KarakterLimiti(Tip);

    // DB string karsiliklari (metin_anahtarlari kolonlari)
    public string TipKodu => TipDefault.Kod(Tip);
    public string KategoriKodu => TipDefault.Kod(Kategori);
    public string KapsamKodu => Kapsam.ToString();  // 'Tenant' | 'Sistem'

    // DSL giris noktasi: AnahtarTanim.Tanim("x").Kategori(...)...Build()
    public static AnahtarTanimBuilder Tanim(string anahtar) => new(anahtar);
}

// Fluent builder - okunabilir, zincirleme katalog DSL'i.
public sealed class AnahtarTanimBuilder
{
    private readonly string _anahtar;
    private Kategori _kategori;
    private AlanTipi _tip;
    private string _etiket = "";
    private string _yonlendirme = "";
    private string _aciklama = "";
    private IReadOnlyList<string> _placeholderlar = Array.Empty<string>();
    private bool _zorunlu;
    private int _sira = 100;
    private bool _deprecated;
    private int? _karakterLimiti;
    private KapsamTipi _kapsam = KapsamTipi.Tenant;

    public AnahtarTanimBuilder(string anahtar) => _anahtar = anahtar;

    public AnahtarTanimBuilder Kategori(Kategori k) { _kategori = k; return this; }
    public AnahtarTanimBuilder Tip(AlanTipi t) { _tip = t; return this; }
    public AnahtarTanimBuilder Etiket(string e) { _etiket = e; return this; }
    public AnahtarTanimBuilder Yonlendirme(string y) { _yonlendirme = y; return this; }
    public AnahtarTanimBuilder Aciklama(string a) { _aciklama = a; return this; }
    public AnahtarTanimBuilder Placeholderlar(params string[] ph) { _placeholderlar = ph; return this; }
    public AnahtarTanimBuilder Zorunlu(bool deger = true) { _zorunlu = deger; return this; }
    public AnahtarTanimBuilder Sira(int s) { _sira = s; return this; }
    public AnahtarTanimBuilder Deprecated(bool deger = true) { _deprecated = deger; return this; }
    public AnahtarTanimBuilder Limit(int l) { _karakterLimiti = l; return this; }
    public AnahtarTanimBuilder Kapsam(KapsamTipi k) { _kapsam = k; return this; }

    public AnahtarTanim Build() => new(
        _anahtar, _kategori, _tip, _etiket, _yonlendirme, _aciklama,
        _placeholderlar, _zorunlu, _sira, _deprecated, _karakterLimiti, _kapsam);
}
