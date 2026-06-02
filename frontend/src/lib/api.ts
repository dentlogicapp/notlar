import type {
  Ben, Kullanici, Klasor, KlasorIcerikOzeti, Not, NotGecmisi,
  DenetimListesi, TokenDogrulama,
  BildirimOzeti,
  Cinsiyet, HatirlatmaKime, HatirlatmaSekli
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
  if (!r.ok) {
    // v11 — 401: kullanıcı pasif/silindi veya token geçersiz
    if (r.status === 401) {
      yetkisizYakala();
    }
    let m = `İstek başarısız (${r.status})`;
    try { const b = await r.json(); if (b?.hata) m = b.hata; } catch {}
    const e = new Error(m) as Error & { status: number };
    e.status = r.status;
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
  hatirlatmaKime?: HatirlatmaKime | null;
  hatirlatmaSekli?: HatirlatmaSekli | null;
}

export interface NotGuncelleOnerisi {
  baslik: string;
  icerik?: string | null;
  klasorId?: string | null;
  degisiklikAciklamasi?: string | null;
  hatirlatmaZamani?: string | null;
  hatirlatmaKime?: HatirlatmaKime | null;
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
  const filename = match ? decodeURIComponent(match[1]) : `planlama-defterimiz.${format}`;

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
  sifreSifirla: (id: string) =>
    ist<{ mesaj: string }>(`/api/admin/kullanicilar/${id}/sifre-sifirla`, { method: "POST" }),
  toggleAktif: (id: string) =>
    ist<Kullanici>(`/api/admin/kullanicilar/${id}/aktiflestir`, { method: "PATCH" }),
  kilidiAc: (id: string) =>
    ist<{ mesaj: string }>(`/api/admin/kullanicilar/${id}/kilit-ac`, { method: "POST" }),
  removeUser: (id: string) => ist<void>(`/api/admin/kullanicilar/${id}`, { method: "DELETE" }),
  denetim: (skip = 0, take = 50) =>
    ist<DenetimListesi>(`/api/admin/denetim?skip=${skip}&take=${take}`),
};
