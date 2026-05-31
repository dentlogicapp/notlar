import type {
  Ben, Kullanici, Klasor, Not, NotGecmisi,
  DenetimListesi, TokenDogrulama
} from "./types";

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:5000";

async function ist<T>(yol: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${yol}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!r.ok) {
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
};

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
  create: (data: { baslik: string; icerik?: string | null; klasorId?: string | null }) =>
    ist<Not>("/api/notlar", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: { baslik: string; icerik?: string | null; klasorId?: string | null; degisiklikAciklamasi?: string | null }) =>
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

export const adminApi = {
  listUsers: () => ist<Kullanici[]>("/api/admin/kullanicilar"),
  createUser: (data: { email: string; adSoyad: string; rol: "admin" | "kullanici" }) =>
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
