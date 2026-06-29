// Web Push abonelik yardimcilari. Service worker zaten kayitli (PWARegister);
// burada izin + pushManager.subscribe + backend kaydi yonetilir.
import { cihazApi } from "./api";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushDestekleniyorMu(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export type PushDurum = "abone" | "kapali" | "izin-reddedildi" | "desteklenmiyor";

export async function pushDurumu(): Promise<PushDurum> {
  if (!pushDestekleniyorMu()) return "desteklenmiyor";
  if (Notification.permission === "denied") return "izin-reddedildi";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? "abone" : "kapali";
}

function platformBul(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "web";
}

function varsayilanCihazAdi(): string {
  const p = platformBul();
  if (p === "ios") return "iPhone/iPad";
  if (p === "android") return "Android cihaz";
  return "Bu tarayıcı";
}

// Izin iste + abone ol + backend'e kaydet. Hata firlatir (cagiran yakalar).
export async function pushAboneOl(cihazAdi?: string): Promise<void> {
  if (!pushDestekleniyorMu()) throw new Error("Bu cihaz bildirimleri desteklemiyor");
  if (!VAPID_PUBLIC) throw new Error("Bildirim altyapısı yapılandırılmamış");
  const izin = await Notification.requestPermission();
  if (izin !== "granted") throw new Error("Bildirim izni verilmedi");

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
    });
  }
  const json = sub.toJSON();
  if (!json.endpoint) throw new Error("Abonelik oluşturulamadı");
  await cihazApi.kayit({
    pushToken: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    platform: platformBul(),
    cihazAdi: cihazAdi ?? varsayilanCihazAdi(),
  });
}

// Bu cihazin aboneligini kaldir (yerel). Backend kaydi sonraki gonderimde 410 ile otomatik temizlenir.
export async function pushCikar(): Promise<void> {
  if (!pushDestekleniyorMu()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
}
