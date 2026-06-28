// Turkiye resmi tatilleri. Milli tatiller her yil sabit; dini bayramlar hicri olduğu için yıla göre verilir.
export function tatilGunleriHesapla(yil: number = new Date().getFullYear()): Set<string> {
  const set = new Set<string>();

  // Her yil sabit milli/resmi tatiller (ay-gun)
  const sabit = ["01-01", "04-23", "05-01", "05-19", "07-15", "08-30", "10-29"];
  for (const md of sabit) set.add(`${yil}-${md}`);

  // Dini bayramlar (yila gore - tahmini; resmi takvimle guncellenebilir)
  const dini: Record<number, string[]> = {
    2026: ["2026-03-20", "2026-03-21", "2026-03-22", "2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30"],
    2027: ["2027-03-10", "2027-03-11", "2027-03-12", "2027-05-16", "2027-05-17", "2027-05-18", "2027-05-19"],
  };
  (dini[yil] ?? []).forEach((d) => set.add(d));

  return set;
}
