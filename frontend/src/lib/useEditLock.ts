"use client";

import { useEffect, useRef, useState } from "react";
import { lockApi } from "./api";

const HEARTBEAT_INTERVAL = 15_000; // 15 saniye

type Resource = "not" | "klasor";

interface LockResult {
  hazir: boolean;        // Kilit alındı mı, kullanıcı düzenleyebilir
  beklemede: boolean;    // İstek sürecinde
  kilitSahibi: string | null; // Başkasındaysa adı
  hata: string | null;
}

/**
 * Edit lock hook — bir resource (not veya klasör) için kilit yönetir.
 * Dialog açılırken acquire, açıkken her 15sn heartbeat, kapanırken release.
 *
 * Kullanım:
 *   const lock = useEditLock("not", noteId, dialogAcik);
 *   if (lock.kilitSahibi) → toast + onOpenChange(false)
 *   if (lock.hazir) → dialog gerçekten interaktif
 */
export function useEditLock(resource: Resource, id: string, etkin: boolean): LockResult {
  const [hazir, setHazir] = useState(false);
  const [beklemede, setBeklemede] = useState(false);
  const [kilitSahibi, setKilitSahibi] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const aktifRef = useRef(false);

  const api = resource === "not"
    ? { al: lockApi.notAl, heartbeat: lockApi.notHeartbeat, birak: lockApi.notBirak }
    : { al: lockApi.klasorAl, heartbeat: lockApi.klasorHeartbeat, birak: lockApi.klasorBirak };

  useEffect(() => {
    if (!etkin || !id) {
      // Etkin değilse, eğer kilidimiz varsa serbest bırak
      if (aktifRef.current) {
        api.birak(id).catch(() => {});
        aktifRef.current = false;
        setHazir(false);
      }
      return;
    }

    let iptal = false;
    setBeklemede(true);
    setKilitSahibi(null);
    setHata(null);

    (async () => {
      try {
        const r = await api.al(id);
        if (iptal) return;
        if (r.basariliMi) {
          aktifRef.current = true;
          setHazir(true);
          // Heartbeat döngüsü
          heartbeatRef.current = window.setInterval(async () => {
            try {
              await api.heartbeat(id);
            } catch {
              // 410 Gone → kilit kayboldu, döngüyü durdur
              if (heartbeatRef.current) {
                clearInterval(heartbeatRef.current);
                heartbeatRef.current = null;
              }
              aktifRef.current = false;
              setHazir(false);
            }
          }, HEARTBEAT_INTERVAL);
        } else {
          setKilitSahibi(r.kilitSahibiAdi);
          setHazir(false);
        }
      } catch (e) {
        if (iptal) return;
        const err = e as Error & { status?: number };
        // 409 = başkasında, response gövdesini fetch katmanından parse edemedik;
        // gövdesi standart hata ise ist() hata mesajı atar.
        if (err.status === 409) {
          // Gövdeden çekemediğimizden generic uyarı
          setKilitSahibi("Aşkın");
        } else {
          setHata(err.message);
        }
        setHazir(false);
      } finally {
        if (!iptal) setBeklemede(false);
      }
    })();

    return () => {
      iptal = true;
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (aktifRef.current) {
        api.birak(id).catch(() => {});
        aktifRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etkin, id, resource]);

  return { hazir, beklemede, kilitSahibi, hata };
}
