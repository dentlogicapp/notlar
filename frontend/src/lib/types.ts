export type Rol = "admin" | "kullanici";
export type Cinsiyet = "kadin" | "erkek";
export type HatirlatmaKime = "askima" | "bana" | "ikimize";
export type HatirlatmaSekli = "uygulama" | "email" | "her_ikisi";

export interface Ben {
  id: string;
  email: string;
  adSoyad: string;
  rol: Rol;
  cinsiyet: Cinsiyet | null;
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
