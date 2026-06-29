// Turkiye resmi tatilleri. Milli tatiller her yil sabit tarihli (sonsuz).
// Dini bayramlar hicri takvime bagli; iki katman:
//   1) diniKesin: Diyanet'in resmen acikladigi yillar (kesin, override).
//   2) diniAlgoritma: tabular hicri takvimden hesap (sonsuz, ±1 gun tahmini).
// Boylece her yil (gecmis/gelecek sinirsiz) tatil isaretli gelir; bilinen yillar kesin tutulur.

const pad = (x: number) => String(x).padStart(2, "0");

// Tabular (aritmetik) hicri tarihten Julian Day Number'a
function islamicToJDN(y: number, m: number, d: number): number {
  return (
    d +
    Math.ceil(29.5 * (m - 1)) +
    (y - 1) * 354 +
    Math.floor((3 + 11 * y) / 30) +
    1948440 -
    1
  );
}

// Julian Day Number'dan miladi (Gregoryen) tarihe
function jdnToGregorian(jdn: number): { y: number; m: number; d: number } {
  let l = jdn + 68569;
  const n = Math.floor((4 * l) / 146097);
  l = l - Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l + 1)) / 1461001);
  l = l - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l) / 2447);
  const d = l - Math.floor((2447 * j) / 80);
  l = Math.floor(j / 11);
  const m = j + 2 - 12 * l;
  const y = 100 * (n - 49) + i + l;
  return { y, m, d };
}

// Diyanet'in resmen acikladigi yillar - kesin (algoritma ±1 gun sapabildigi icin override).
// Yeni yillar aciklandikca buraya eklenir; eklenmeyen yillar algoritmadan uretilir.
const diniKesin: Record<number, [string, string][]> = {
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
    ["2027-03-09", "Ramazan Bayramı Arifesi"],
    ["2027-03-10", "Ramazan Bayramı (1. Gün)"],
    ["2027-03-11", "Ramazan Bayramı (2. Gün)"],
    ["2027-03-12", "Ramazan Bayramı (3. Gün)"],
    ["2027-05-15", "Kurban Bayramı Arifesi"],
    ["2027-05-16", "Kurban Bayramı (1. Gün)"],
    ["2027-05-17", "Kurban Bayramı (2. Gün)"],
    ["2027-05-18", "Kurban Bayramı (3. Gün)"],
    ["2027-05-19", "Kurban Bayramı (4. Gün)"],
  ],
};

// Tabular hicri takvimden, verilen miladi yila dusen dini bayramlari uretir (sonsuz).
function diniAlgoritma(yil: number): [string, string][] {
  const sonuc: [string, string][] = [];
  // O miladi yila yakin hicri yil (kaymayi yakalamak icin komsu yillar da taranir)
  const H = Math.round((yil - 622) * 1.030684);
  const ekle = (jdn: number, ad: string) => {
    const g = jdnToGregorian(jdn);
    if (g.y === yil) sonuc.push([`${yil}-${pad(g.m)}-${pad(g.d)}`, ad]);
  };
  for (const h of [H - 1, H, H + 1]) {
    // Ramazan Bayrami: 1 Sevval (10. ay)
    const s = islamicToJDN(h, 10, 1);
    ekle(s - 1, "Ramazan Bayramı Arifesi");
    ekle(s, "Ramazan Bayramı (1. Gün)");
    ekle(s + 1, "Ramazan Bayramı (2. Gün)");
    ekle(s + 2, "Ramazan Bayramı (3. Gün)");
    // Kurban Bayrami: 10 Zilhicce (12. ay)
    const z = islamicToJDN(h, 12, 10);
    ekle(z - 1, "Kurban Bayramı Arifesi");
    ekle(z, "Kurban Bayramı (1. Gün)");
    ekle(z + 1, "Kurban Bayramı (2. Gün)");
    ekle(z + 2, "Kurban Bayramı (3. Gün)");
    ekle(z + 3, "Kurban Bayramı (4. Gün)");
  }
  return sonuc;
}

export function tatilHaritasi(yil: number = new Date().getFullYear()): Map<string, string> {
  const m = new Map<string, string>();

  // Milli tatiller - her yil sabit tarihli (sonsuz)
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

  // Dini bayramlar - bilinen yil kesin, digerleri algoritmadan (sonsuz)
  const dini = diniKesin[yil] ?? diniAlgoritma(yil);
  for (const [anahtar, ad] of dini) m.set(anahtar, ad);

  return m;
}

// Geriye uyumlu: sadece tarih kumesi (takvim isaretleri icin)
export function tatilGunleriHesapla(yil: number = new Date().getFullYear()): Set<string> {
  return new Set(tatilHaritasi(yil).keys());
}
