// v18 - Ortak sayac hesaplama (CountdownWidget + LivePreview paylasir, DRY).
// Hedef gelmedi -> geri sayim (gecti=false). Hedef gecti -> 0'dan ileri sayim (gecti=true).
export interface SayacDurum {
  gecti: boolean;
  gun: number;
  sa: number;
  dk: number;
  sn: number;
}

export function sayacHesapla(hedefMs: number): SayacDurum {
  const fark = hedefMs - Date.now();
  const gecti = fark <= 0;
  const m = Math.abs(fark);
  return {
    gecti,
    gun: Math.floor(m / 86400000),
    sa: Math.floor((m % 86400000) / 3600000),
    dk: Math.floor((m % 3600000) / 60000),
    sn: Math.floor((m % 60000) / 1000),
  };
}

// datetime-local ("YYYY-MM-DDTHH:mm") veya date ("YYYY-MM-DD") -> ms; gecersiz -> null
export function hedefMsCoz(hedefTarih: string): number | null {
  if (!hedefTarih) return null;
  const t = new Date(hedefTarih).getTime();
  return isNaN(t) ? null : t;
}
