"use client";

// GECICI test bilesenidir - push kaniti sonrasi tamamen silinecek.
import { useState } from "react";

const VAPID_PUBLIC =
  "BMFaomZjBM0eDaYAhWwjPDMEZZe-eRzn2mk-OF9fWr_dSrlm9bowa-5QQGZW03aKd61mb4l0xtiXZ80O0OPxHm4";
const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:5000";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function PushTest() {
  const [durum, setDurum] = useState("");

  async function test() {
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        setDurum("Bu cihaz/tarayici push desteklemiyor");
        return;
      }
      setDurum("Izin isteniyor...");
      const izin = await Notification.requestPermission();
      if (izin !== "granted") {
        setDurum("Izin verilmedi (" + izin + ")");
        return;
      }
      setDurum("Abonelik olusturuluyor...");
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
        });
      }
      const json = sub.toJSON();
      setDurum("Gonderiliyor...");
      const res = await fetch(`${API}/api/push/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        }),
      });
      if (res.ok) {
        setDurum("Gonderildi - bildirim birkac saniye icinde dusmeli");
      } else {
        const t = await res.text().catch(() => "");
        setDurum("Backend hata " + res.status + " " + t);
      }
    } catch (e) {
      setDurum("Hata: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 flex max-w-[220px] flex-col gap-1">
      <button
        onClick={test}
        className="rounded-lg bg-[#c4704d] px-3 py-2 text-sm font-medium text-white shadow-lg"
      >
        Test bildirimi gonder
      </button>
      {durum && (
        <span className="rounded bg-black/75 px-2 py-1 text-xs text-white">{durum}</span>
      )}
    </div>
  );
}
