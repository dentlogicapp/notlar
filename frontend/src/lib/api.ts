import type {
  Ben, Kullanici, Klasor, KlasorIcerikOzeti, Not, NotGecmisi,
  DenetimListesi, TokenDogrulama,
  BildirimOzeti,
  Cinsiyet, HatirlatmaKime, HatirlatmaSekli,
  Uyelik, Isletme, MetinAnahtari, AiAyari, AiModel, AiTestSonucu,
  TenantUye,
  MetinBirlesik, MetinVersiyon, OnboardingDurum,
  TaslakSonucu,
  IsletmeOzet, IsletmeDetay, SuperAdminOzet,
} from "./types";

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:5000";

// v11 — Pasifleştirme/silindi anında çıkış için global 401 koruma
let yonlendiriliyorMu = false; // Çoklu yönlendirme önleme
function yetkisizYakala() {
  if (typeof window === "undefined") return;
  if (yonlendiriliyorMu) return;

  // Giriş ve şifre belirle sayfalarında zaten yetkisiziz — sonsuz döngü önle
  const yol = window.location.pathname;
  if (yol.startsWith("/giris") || yol.startsWith("/sifre-belirle")) return;

  yonlendiriliyorMu = true;
  // Toast (sonner) sayfa yönlenmeden gözükebilsin
  try {
    // Sonner global import yapmadan, basit window event ile bildir
    window.dispatchEvent(new CustomEvent("yetkisiz-erisim"));
  } catch {}
  // Kısa gecikme: toast'ın render olabilmesi için
  setTimeout(() => {
    window.location.href = "/giris";
  }, 80);
}

async function ist<T>(yol: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${yol}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  // v19 İş 2 - kesintisiz tenant geçişi: backend aktif tenant'ı değiştirdiyse UI'yi (marka/sayaç/notlar) senkronla
  if (typeof window !== "undefined" && r.headers.get("X-Tenant-Gecis")) {
    window.dispatchEvent(new CustomEvent("tenant-gecis"));
  }
  if (!r.ok) {
    // v11 — 401: kullanıcı pasif/silindi veya token geçersiz
    if (r.status === 401) {
      yetkisizYakala();
    }
    let m = `İstek başarısız (${r.status})`;
    let kod: string | undefined;
    try {
      const b = await r.json();
      // v16 yeni şekil: { hata: KOD, mesaj: "..." } -> mesaj insan-okur, hata makine-kodu
      // Eski şekil: { hata: "İnsan mesajı" } -> mesaj yok, hata zaten mesaj (geriye uyumlu)
      if (b?.mesaj) { m = b.mesaj; if (b?.hata) kod = b.hata; }
      else if (b?.hata) { m = b.hata; }
    } catch {}
    const e = new Error(m) as Error & { status: number; kod?: string };
    e.status = r.status;
    e.kod = kod;
    throw e;
  }
  if (r.status === 204) return undefined as T;
  return r.json() as Promise<T>;
}

export const authApi = {
  giris: (email: string, sifre: string, beniHatirla = true) =>
    ist<Ben>("/api/auth/giris", { method: "POST", body: JSON.stringify({ email, sifre, beniHatirla }) }),
  ben: () => ist<Ben>("/api/auth/ben"),
  cikis: () => ist<{ mesaj: string }>("/api/auth/cikis", { method: "POST" }),
  tokenDogrula: (token: string) =>
    ist<TokenDogrulama>(`/api/auth/token/${encodeURIComponent(token)}`),
  sifreBelirle: (token: string, yeniSifre: string) =>
    ist<{ mesaj: string }>("/api/auth/sifre-belirle", { method: "POST", body: JSON.stringify({ token, yeniSifre }) }),
  sifreSifirlaIste: (email: string) =>
    ist<{ mesaj: string }>("/api/auth/sifre-sifirla-iste", { method: "POST", body: JSON.stringify({ email }) }),
};

export const klasorApi = {
  list: () => ist<Klasor[]>("/api/klasorler"),
  create: (data: { ad: string; aciklama?: string | null; ikon?: string | null; ustKlasorId?: string | null }) =>
    ist<Klasor>("/api/klasorler", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: { ad: string; aciklama?: string | null; ikon?: string | null }) =>
    ist<Klasor>(`/api/klasorler/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  remove: (id: string) => ist<void>(`/api/klasorler/${id}`, { method: "DELETE" }),
  icerikOzeti: (id: string) => ist<KlasorIcerikOzeti>(`/api/klasorler/${id}/icerik-ozeti`),
};

export interface NotOlusturOnerisi {
  baslik: string;
  icerik?: string | null;
  klasorId?: string | null;
  hatirlatmaZamani?: string | null;
  hatirlatmaKime?: HatirlatmaKime | null;       // DEPRECATED v19 P4
  hatirlatmaAliciIdler?: string[] | null;       // v19 P4 - secili uye id'leri
  hatirlatmaSekli?: HatirlatmaSekli | null;
}

export interface NotGuncelleOnerisi {
  baslik: string;
  icerik?: string | null;
  klasorId?: string | null;
  degisiklikAciklamasi?: string | null;
  hatirlatmaZamani?: string | null;
  hatirlatmaKime?: HatirlatmaKime | null;       // DEPRECATED v19 P4
  hatirlatmaAliciIdler?: string[] | null;       // v19 P4 - secili uye id'leri
  hatirlatmaSekli?: HatirlatmaSekli | null;
  hatirlatmaSil?: boolean;
}

export const notApi = {
  list: (opts?: { klasor?: string; tamamlandi?: boolean; silindi?: boolean }) => {
    const q = new URLSearchParams();
    if (opts?.klasor) q.set("klasor", opts.klasor);
    if (opts?.tamamlandi !== undefined) q.set("tamamlandi", String(opts.tamamlandi));
    if (opts?.silindi !== undefined) q.set("silindi", String(opts.silindi));
    const qs = q.toString();
    return ist<Not[]>(`/api/notlar${qs ? "?" + qs : ""}`);
  },
  get: (id: string) => ist<Not>(`/api/notlar/${id}`),
  create: (data: NotOlusturOnerisi) =>
    ist<Not>("/api/notlar", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: NotGuncelleOnerisi) =>
    ist<Not>(`/api/notlar/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  tamamla: (id: string, tamamlanmaAciklamasi: string) =>
    ist<Not>(`/api/notlar/${id}/tamamla`, { method: "POST", body: JSON.stringify({ tamamlanmaAciklamasi }) }),
  yenidenAc: (id: string) =>
    ist<Not>(`/api/notlar/${id}/yeniden-ac`, { method: "POST" }),
  remove: (id: string) => ist<void>(`/api/notlar/${id}`, { method: "DELETE" }),
  geriYukle: (id: string) =>
    ist<Not>(`/api/notlar/${id}/geri-yukle`, { method: "POST" }),
  // v19 Paket 3 - kalici silme (sadece coptekiler) + cop bosalt
  kaliciSil: (id: string) => ist<void>(`/api/notlar/${id}/kalici`, { method: "DELETE" }),
  copBosalt: () => ist<{ silinen: number }>("/api/notlar/cop-bosalt", { method: "DELETE" }),
  gecmis: (id: string) => ist<NotGecmisi[]>(`/api/notlar/${id}/gecmis`),
};

export const bildirimApi = {
  list: () => ist<BildirimOzeti>("/api/bildirimler/"),
  okundu: (id: string) =>
    ist<void>(`/api/bildirimler/${id}/okundu`, { method: "POST" }),
  hepsiOkundu: () =>
    ist<void>("/api/bildirimler/hepsi-okundu", { method: "POST" }),
};

// Edit lock (yumuşak kilit)
export interface KilitYanit {
  basariliMi: boolean;
  kilitSahibiAdi: string | null;
}

export const lockApi = {
  // Not
  notAl: (id: string) =>
    ist<KilitYanit>(`/api/notlar/${id}/kilit`, { method: "POST" }),
  notHeartbeat: (id: string) =>
    ist<void>(`/api/notlar/${id}/kilit/heartbeat`, { method: "POST" }),
  notBirak: (id: string) =>
    ist<void>(`/api/notlar/${id}/kilit`, { method: "DELETE" }),
  // Klasör
  klasorAl: (id: string) =>
    ist<KilitYanit>(`/api/klasorler/${id}/kilit`, { method: "POST" }),
  klasorHeartbeat: (id: string) =>
    ist<void>(`/api/klasorler/${id}/kilit/heartbeat`, { method: "POST" }),
  klasorBirak: (id: string) =>
    ist<void>(`/api/klasorler/${id}/kilit`, { method: "DELETE" }),
};

export type DefteriIndirFormat = "html" | "pdf" | "docx" | "xlsx";

export async function defteriIndir(format: DefteriIndirFormat): Promise<void> {
  const r = await fetch(`${API}/api/defteri-indir/?format=${format}`, {
    credentials: "include",
  });
  if (!r.ok) {
    let m = `İndirme başarısız (${r.status})`;
    try { const b = await r.json(); if (b?.hata) m = b.hata; } catch {}
    throw new Error(m);
  }
  // Dosyayı blob olarak al + tarayıcıya indir
  const blob = await r.blob();
  // Content-Disposition'dan filename çek
  const cd = r.headers.get("content-disposition") || "";
  const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
  const filename = match ? decodeURIComponent(match[1]) : `defter.${format}`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const adminApi = {
  listUsers: () => ist<Kullanici[]>("/api/admin/kullanicilar"),
  createUser: (data: { email: string; adSoyad: string; rol: "admin" | "kullanici"; cinsiyet: Cinsiyet }) =>
    ist<Kullanici>("/api/admin/kullanicilar", { method: "POST", body: JSON.stringify(data) }),
  guncelleUser: (id: string, data: { adSoyad: string; cinsiyet: Cinsiyet }) =>
    ist<Kullanici>(`/api/admin/kullanicilar/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  sifreSifirla: (id: string) =>
    ist<{ mesaj: string }>(`/api/admin/kullanicilar/${id}/sifre-sifirla`, { method: "POST" }),
  toggleAktif: (id: string) =>
    ist<Kullanici>(`/api/admin/kullanicilar/${id}/aktiflestir`, { method: "PATCH" }),
  kilidiAc: (id: string) =>
    ist<{ mesaj: string }>(`/api/admin/kullanicilar/${id}/kilit-ac`, { method: "POST" }),
  removeUser: (id: string, devret = false) =>
    ist<void>(`/api/admin/kullanicilar/${id}${devret ? "?devret=true" : ""}`, { method: "DELETE" }),
  denetim: (skip = 0, take = 50) =>
    ist<DenetimListesi>(`/api/admin/denetim?skip=${skip}&take=${take}`),
};

// v16 — Isletme ayar guncelle istegi (frontend "...Onerisi" konvansiyonu; backend "...Istegi")
export interface IsletmeAyarGuncelleOnerisi {
  markaAdi?: string;
  markaEmoji?: string;
  ikonSeti?: string;
  karsilamaBasligi?: string;
  karsilamaAltMetni?: string;
  sayacAktif?: boolean;
  sayacBasligi?: string;
  sayacHedefTarihi?: string | null;   // ISO string; backend DateTime?
  mailImza?: string;
  mailTonu?: string;
}

// v15 — Multi-tenant API
export const isletmeApi = {
  uyelik: () => ist<Uyelik[]>("/api/isletmeler/uyelik"),
  uyeler: () => ist<TenantUye[]>("/api/isletmeler/uyeler"),  // v19 P4 - hatirlatma alici secimi
  aktifDegistir: (id: string) =>
    ist<Ben>(`/api/isletmeler/aktif/${id}`, { method: "POST" }),
  aktif: () => ist<Isletme>("/api/isletmeler/aktif"),
  // v16 — marka & görünüm ayarlarını güncelle (PATCH)
  aktifGuncelle: (data: IsletmeAyarGuncelleOnerisi) =>
    ist<Isletme>("/api/isletmeler/aktif", { method: "PATCH", body: JSON.stringify(data) }),
};

// v17 - Metin anahtari istegi (frontend "...Onerisi" konvansiyonu)
export interface MetinAnahtariOnerisi {
  anahtar: string;
  etiket: string;
  yonlendirme: string;
  aciklama?: string | null;
  tip: string;
  zorunlu?: boolean;
  desteklenenPlaceholderlar?: string[];
  sira?: number;
  kategori: string;
}

export interface SemaAnahtar {
  anahtar: string;
  kategori: string;
  tip: string;
  kapsam: string;  // v18 Asama 17.1 - 'Tenant' | 'Sistem'
  efektifLimit: number;
  ozelLimit: number | null;
  etiket: string;
  yonlendirme: string;
  aciklama: string;
  placeholderlar: string[];
  zorunlu: boolean;
  deprecated: boolean;
  sira: number;
  tenantDolduran: number;
  tenantToplam: number;
}

export interface SemaYaniti {
  surum: string;
  sonGuncelleme: string | null;
  toplamTenant: number;
  anahtarlar: SemaAnahtar[];
}

export const sistemApi = {
  listAnahtar: () => ist<MetinAnahtari[]>("/api/super-admin/metin-anahtarlari"),
  getAnahtar: (id: string) => ist<MetinAnahtari>(`/api/super-admin/metin-anahtarlari/${id}`),
  createAnahtar: (data: MetinAnahtariOnerisi) =>
    ist<MetinAnahtari>("/api/super-admin/metin-anahtarlari", { method: "POST", body: JSON.stringify(data) }),
  updateAnahtar: (id: string, data: MetinAnahtariOnerisi) =>
    ist<MetinAnahtari>(`/api/super-admin/metin-anahtarlari/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAnahtar: (id: string) =>
    ist<void>(`/api/super-admin/metin-anahtarlari/${id}`, { method: "DELETE" }),
  deprecateAnahtar: (id: string) =>
    ist<MetinAnahtari>(`/api/super-admin/metin-anahtarlari/${id}/deprecate`, { method: "POST" }),
  kopyalaAnahtar: (id: string) =>
    ist<MetinAnahtari>(`/api/super-admin/metin-anahtarlari/${id}/kopyala`, { method: "POST" }),
  // v18 Asama 11.9 B2 - read-only sistem semasi
  getSema: () => ist<SemaYaniti>("/api/super-admin/sema"),
};

// v17 - AI saglayici ayar istegi
export interface AiAyariOnerisi {
  saglayici: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string | null;
  timeoutMs?: number;
  aktif?: boolean;
}

export const aiAyarApi = {
  getAyar: () => ist<AiAyari>("/api/super-admin/ai-ayarlari"),
  updateAyar: (data: AiAyariOnerisi) =>
    ist<AiAyari>("/api/super-admin/ai-ayarlari", { method: "PUT", body: JSON.stringify(data) }),
  testAyar: () => ist<AiTestSonucu>("/api/super-admin/ai-ayarlari/test", { method: "POST" }),
  modeller: (saglayici: string) =>
    ist<{ saglayici: string; modeller: AiModel[] }>(`/api/super-admin/ai-ayarlari/modeller?saglayici=${encodeURIComponent(saglayici)}`),
};

// v18 - Sifir Sablon: tenant metin yonetimi (/api/admin/metinler)
// v18 Asama 19 B2 - tur analytics
export const turApi = {
  audit: (eylem: string, adimNo: number, kalanSureSn?: number) =>
    ist<{ kaydedildi: boolean }>("/api/tur-audit", {
      method: "POST",
      body: JSON.stringify({ eylem, adimNo, kalanSureSn }),
    }),
};

export const metinApi = {
  list: () => ist<MetinBirlesik[]>("/api/metinler"),
  get: (anahtar: string) =>
    ist<MetinBirlesik>(`/api/admin/metinler/${encodeURIComponent(anahtar)}`),
  guncelle: (anahtar: string, icerik: string) =>
    ist<MetinBirlesik>(`/api/admin/metinler/${encodeURIComponent(anahtar)}`, {
      method: "PUT",
      body: JSON.stringify({ icerik }),
    }),
  sifirla: (anahtar: string) =>
    ist<void>(`/api/admin/metinler/${encodeURIComponent(anahtar)}`, { method: "DELETE" }),
  versiyonlar: (anahtar: string) =>
    ist<MetinVersiyon[]>(`/api/admin/metinler/${encodeURIComponent(anahtar)}/versiyonlar`),
  versiyonaDon: (anahtar: string, versiyonId: string) =>
    ist<MetinBirlesik>(
      `/api/admin/metinler/${encodeURIComponent(anahtar)}/versiyona-don/${versiyonId}`,
      { method: "POST" }
    ),
  onboardingDurum: () => ist<OnboardingDurum>("/api/admin/metinler/onboarding-durum"),
  // v19 6c - admin kendi adresine ornek davetiye (test mail)
  testMail: () => ist<{ gonderildi: boolean; email: string }>("/api/admin/metinler/test-mail", { method: "POST" }),
  // v18 Asama 17-E - welcome/davetiye onizleme test maili
  onboardingTestMail: (email: string, ad?: string) =>
    ist<{ gonderildi: boolean }>("/api/admin/onboarding-test-mail", {
      method: "POST",
      body: JSON.stringify({ email, ad }),
    }),
  // v19 4-B/Is2 - gercek mail HTML onizleme. degerler = kaydedilmemis duzenleme (anlik); bos -> kayitli hali.
  mailOnizle: async (tip: string, degerler?: Record<string, string>): Promise<string> => {
    const res = await fetch(`${API}/api/admin/metinler/mail-onizle`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tip, degerler: degerler ?? null }),
    });
    if (!res.ok) throw new Error("Önizleme alınamadı");
    return res.text();
  },
};

// v18 Asama 11/12 - AI taslak oneri (saglik durumu + taslak uretme). Saglayicidan habersiz.
export const aiApi = {
  saglik: () => ist<{ saglikli: boolean }>("/api/super-admin/ai-assist/saglik"),
  taslakOner: (govde: { anahtar: string; ton?: string; uzunluk?: string; etkinlikTanimi?: string }) =>
    ist<TaslakSonucu>("/api/super-admin/ai-assist/taslak-oner", {
      method: "POST",
      body: JSON.stringify(govde),
    }),
  // v18 Asama 11.6 - Super admin metin-anahtari formu icin dokumantasyon onerisi (tenant'siz, DB lookup yok).
  dokumantasyonOner: (govde: { anahtarKodu: string; etiket?: string; tip?: string; kategori?: string; hedefAlan?: string }) =>
    ist<TaslakSonucu>("/api/super-admin/ai-assist/dokumantasyon-oner", {
      method: "POST",
      body: JSON.stringify(govde),
    }),
};

// v19 Asama 8 - Super admin tenant yonetimi (/api/super-admin/isletmeler)
export const superAdminIsletmeApi = {
  list: () => ist<IsletmeOzet[]>("/api/super-admin/isletmeler"),
  get: (id: string) => ist<IsletmeDetay>(`/api/super-admin/isletmeler/${id}`),
  olustur: (data: { markaAdi: string; markaEmoji?: string; kullanimModu: string }) =>
    ist<IsletmeOzet>("/api/super-admin/isletmeler", { method: "POST", body: JSON.stringify(data) }),
  durum: (id: string) =>
    ist<{ id: string; aktif: boolean }>(`/api/super-admin/isletmeler/${id}/durum`, { method: "POST" }),
  adminAta: (id: string, data: { email: string; adSoyad: string; cinsiyet: string }) =>
    ist<{ kullaniciId: string; email: string }>(`/api/super-admin/isletmeler/${id}/admin-ata`, { method: "POST", body: JSON.stringify(data) }),
  uyeGuncelle: (id: string, uyeId: string, data: { adSoyad: string; cinsiyet: Cinsiyet }) =>
    ist<{ ok: boolean; kullaniciId: string; adSoyad: string; cinsiyet: string | null }>(`/api/super-admin/isletmeler/${id}/uye/${uyeId}`, { method: "PUT", body: JSON.stringify(data) }),
  goruntule: (id: string) =>
    ist<{ ok: boolean; gecerlilikBitis: string }>(`/api/super-admin/isletmeler/${id}/goruntule`, { method: "POST" }),
  goruntuleBitir: () =>
    ist<void>("/api/super-admin/isletmeler/goruntule/bitir", { method: "POST" }),
  davetOnizle: (data: { markaAdi?: string; adminAd?: string }) =>
    ist<{ html: string }>("/api/super-admin/isletmeler/davet-onizle", { method: "POST", body: JSON.stringify(data) }),
  sil: (id: string) =>
    ist<{ ok: boolean }>(`/api/super-admin/isletmeler/${id}`, { method: "DELETE" }),
};

// v19 P4 - super admin yonetimi (/api/super-admin/yoneticiler)
export const superAdminYoneticiApi = {
  list: () => ist<SuperAdminOzet[]>("/api/super-admin/yoneticiler"),
  ata: (email: string) =>
    ist<SuperAdminOzet>("/api/super-admin/yoneticiler", { method: "POST", body: JSON.stringify({ email }) }),
  kaldir: (kullaniciId: string) =>
    ist<void>(`/api/super-admin/yoneticiler/${kullaniciId}`, { method: "DELETE" }),
};
