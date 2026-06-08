"use client";

// v18 Asama 14 - tip bazli renkli karakter sayaci. Hedef = yumusak limit (asilabilir, engel degil).
// 0-80% yesil, 80-120% sari, 120%+ kirmizi. Spec 5.8.
const HEDEFLER: Record<string, number> = {
  subject: 50,
  baslik: 60,
  metin: 200,
  body: 5000,
  placeholder_kisa: 80,
};

export function KarakterSayaci({ mevcut, tip, karakterLimiti }: { mevcut: number; tip: string; karakterLimiti?: number | null }) {
  // v18 Asama 11.8 - anahtar bazli ozel limit varsa onu kullan, yoksa tipten gelen default
  const hedef = karakterLimiti ?? HEDEFLER[tip];
  if (!hedef) return null;

  const oran = hedef > 0 ? mevcut / hedef : 0;
  const renk =
    oran <= 0.8
      ? "text-green-600 dark:text-green-400"
      : oran <= 1.2
        ? "text-amber-600 dark:text-amber-500"
        : "text-red-600 dark:text-red-400";

  return (
    <span className={`text-[11px] tabular-nums font-medium shrink-0 ${renk}`} title="Önerilen uzunluk (aşılabilir)">
      {mevcut} / {hedef}
    </span>
  );
}
