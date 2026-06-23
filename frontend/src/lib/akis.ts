// v19 Asama 10 - Super admin canli olay akisi (SSE) wrapper.
// Backend: GET /api/super-admin/akis (text/event-stream, isimsiz "message" event).
// Olay tipi json icindeki "olay" alanindan okunur.

export type AkisOlayi = {
  olay: string;
  hedefTip?: string | null;
  hedefId?: string | null;
  isletmeId?: string | null;
  aktorEmail?: string | null;
  detay?: string | null;
  zaman: string;
};

/**
 * Super admin akisina baglanir. Her olayda onOlay, baglanti durumu degisince onDurum cagrilir.
 * Donen fonksiyon baglantiyi kapatir (cleanup).
 */
export function akisBaglan(
  onOlay: (o: AkisOlayi) => void,
  onDurum?: (bagli: boolean) => void
): () => void {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? "";
  const es = new EventSource(`${base}/api/super-admin/akis`, { withCredentials: true });

  es.onopen = () => onDurum?.(true);
  es.onmessage = (e) => {
    try {
      onOlay(JSON.parse(e.data) as AkisOlayi);
    } catch {
      // bozuk/heartbeat satiri -> yok say
    }
  };
  es.onerror = () => onDurum?.(false);

  return () => es.close();
}
