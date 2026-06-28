// Turkiye resmi tatilleri (ad + tarih). Milli tatiller her yil sabit; dini bayramlar hicri olduğu icin yila gore verilir.
// NOT: Dini bayram tarihleri tahminidir; resmi takvimle dogrulanmalidir.
export function tatilHaritasi(yil: number = new Date().getFullYear()): Map<string, string> {
  const m = new Map<string, string>();

  const sabit: [string, string][] = [
    ["01-01", "Yılbaşı"],
    ["04-23", "Ulusal Egemenlik ve Çocuk Bayramı"],
    ["05-01", "Emek ve Dayanışma Günü"],
    ["05-19", "Atatürk'ü Anma, Gençlik ve Spor Bayramı"],
    ["07-15", "Demokrasi ve Milli Birlik Günü"],
    ["08-30", "Zafer Bayramı"],
    ["10-29", "Cumhuriyet Bayramı"],
  ];
  for (const [md, ad] of sabit) m.set(`${yil}-${md}`, ad);

  const dini: Record<number, [string, string][]> = {
    2026: [
      ["2026-03-20", "Ramazan Bayramı Arifesi"],
      ["2026-03-21", "Ramazan Bayramı (1. Gün)"],
      ["2026-03-22", "Ramazan Bayramı (2. Gün)"],
      ["2026-03-23", "Ramazan Bayramı (3. Gün)"],
      ["2026-05-26", "Kurban Bayramı Arifesi"],
      ["2026-05-27", "Kurban Bayramı (1. Gün)"],
      ["2026-05-28", "Kurban Bayramı (2. Gün)"],
      ["2026-05-29", "Kurban Bayramı (3. Gün)"],
      ["2026-05-30", "Kurban Bayramı (4. Gün)"],
    ],
    2027: [
      ["2027-03-10", "Ramazan Bayramı (1. Gün)"],
      ["2027-03-11", "Ramazan Bayramı (2. Gün)"],
      ["2027-03-12", "Ramazan Bayramı (3. Gün)"],
      ["2027-05-16", "Kurban Bayramı (1. Gün)"],
      ["2027-05-17", "Kurban Bayramı (2. Gün)"],
      ["2027-05-18", "Kurban Bayramı (3. Gün)"],
      ["2027-05-19", "Kurban Bayramı (4. Gün)"],
    ],
  };
  for (const [anahtar, ad] of dini[yil] ?? []) m.set(anahtar, ad);

  return m;
}

// Geriye uyumlu: sadece tarih kumesi (takvim isaretleri icin)
export function tatilGunleriHesapla(yil: number = new Date().getFullYear()): Set<string> {
  return new Set(tatilHaritasi(yil).keys());
}
