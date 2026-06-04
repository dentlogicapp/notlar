export type Rol = "admin" | "kullanici";
export type Cinsiyet = "kadin" | "erkek";
export type HatirlatmaKime = "askima" | "bana" | "ikimize";
export type HatirlatmaSekli = "uygulama" | "email" | "her_ikisi";

// v15 — Multi-tenant
export interface Uyelik {
  isletmeId: string;
  markaAdi: string;
  markaEmoji: string;
  kullanimModu: string;     // 'es'|'aile'|'ekip'|'tatil'|'ozel'
  rol: Rol;                  // tenant scope rol
  aktif: boolean;
}

export interface Isletme {
  id: string;
  markaAdi: string;
  markaEmoji: string;
  ikonSeti: string;
  karsilamaBasligi: string;
  karsilamaAltMetni: string;
  sayacAktif: boolean;
  sayacBasligi: string;
  sayacHedefTarihi: string | null;
  mailImza: string;
  mailTonu: string;
  kullanimModu: string;
}

export interface Ben {
  id: string;
  email: string;
  adSoyad: string;
  rol: Rol;                       // DEPRECATED v15 (geriye uyumluluk için; tenant rolü uyelikler[].rol)
  cinsiyet: Cinsiyet | null;
  // v15 — Multi-tenant
  superAdmin: boolean;
  aktifIsletmeId: string | null;  // null = super_admin + 0 tenant
  uyelikler: Uyelik[];
}

export interface Kullanici {
  id: string;
  email: string;
  adSoyad: string;
  rol: Rol;
  aktif: boolean;
  cinsiyet: Cinsiyet | null;
  sifreBelirlendi: boolean;
  kilitli: boolean;
  olusturmaZamani: string;
  sonGirisZamani: string | null;
  // v12 — Silme onayında gösterilen veriler
  notSayisi: number;
  klasorSayisi: number;
}

export interface Klasor {
  id: string;
  ad: string;
  aciklama: string | null;
  ikon: string;
  ustKlasorId: string | null;
  olusturanAdSoyad: string;
  olusturmaZamani: string;
  notSayisi: number;
  altKlasorSayisi: number;
  sistemMi: boolean;
  kilitSahibiAdi: string | null;
}

// Klasör silme onayı öncesi içerik özeti
export interface KlasorIcerikOzeti {
  id: string;
  ad: string;
  bekleyenNot: number;
  tamamlananNot: number;
  silinmisNot: number;
  toplamNot: number;
}

export interface Not {
  id: string;
  baslik: string;
  icerik: string | null;
  tamamlandi: boolean;
  tamamlanmaAciklamasi: string | null;
  tamamlanmaZamani: string | null;
  tamamlayanAdSoyad: string | null;
  klasorId: string | null;
  klasorAdi: string | null;
  olusturanId: string;
  olusturanAdSoyad: string;
  olusturmaZamani: string;
  guncellemeZamani: string;
  silindi: boolean;
  silinmeZamani: string | null;
  // Hatırlatma (kurulmamışsa null)
  hatirlatmaZamani: string | null;
  hatirlatmaKime: HatirlatmaKime | null;
  hatirlatmaSekli: HatirlatmaSekli | null;
  hatirlatmaGonderildiMi: boolean;
  // Kilit
  kilitSahibiAdi: string | null;
  eskiKlasorId: string | null;
}

export interface NotGecmisi {
  id: string;
  eylem: "olusturuldu" | "duzenlendi" | "tamamlandi" | "yeniden_acildi" | "silindi" | "geri_alindi";
  aciklama: string | null;
  eskiDeger: string | null;
  yeniDeger: string | null;
  yapanAdSoyad: string;
  yapilisZamani: string;
}

export interface Denetim {
  id: string;
  olay: string;
  hedefTip: string | null;
  hedefId: string | null;
  aktorKullaniciId: string | null;
  aktorEmail: string | null;
  ip: string | null;
  detay: string | null;
  degisenAlanlar: string | null;
  zaman: string;
}

export interface DenetimListesi {
  toplam: number;
  kayitlar: Denetim[];
}

export interface TokenDogrulama {
  email: string;
  adSoyad: string;
  amac: "setup" | "reset";
}

export interface Bildirim {
  id: string;
  tip: string;
  notId: string | null;
  baslik: string;
  mesaj: string;
  okunduMu: boolean;
  okumaZamani: string | null;
  olusturmaZamani: string;
}

export interface BildirimOzeti {
  okunmamisSayisi: number;
  bildirimler: Bildirim[];
}

// v17 - Sistem metin anahtari
export interface MetinAnahtari {
  id: string;
  anahtar: string;
  etiket: string;
  yonlendirme: string;
  aciklama: string;
  tip: string;
  zorunlu: boolean;
  desteklenenPlaceholderlar: string[];
  sira: number;
  kategori: string;
  deprecated: boolean;
  olusturmaZamani: string;
  guncellemeZamani: string;
}
