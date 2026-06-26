// v19 - AI Compose: serbest metin uretimi YALNIZ bu 3 alanda acik.
// Super admin karari (maliyet + kapsam koruma). Backend AiAssistEndpoints.AiIzinliAnahtarlar
// ile birebir ayni liste tutulur (iki kale: frontend buton gizler, backend 403).
//
// varsayilanPrompt: popover acilinca textarea'ya DOLU gelir (placeholder degil) - super admin
//   dogrudan ton/uzunluk secip uretebilir ya da metni duzenleyebilir.
// mailTip: gercek mail onizlemesi icin tip ("davet" vb.). null = mail degil (dashboard) -> metin onizleme.

export interface AiAlanConfig {
  varsayilanPrompt: string;
  mailTip: string | null;
}

export const AI_ALANLAR: Record<string, AiAlanConfig> = {
  mail_davetiye_giris_metni: {
    varsayilanPrompt: "Mükemmel bir davet metni oluşturman için en harika öneriyi yaz.",
    mailTip: "davet",
  },
  mail_davetiye_rehber: {
    varsayilanPrompt:
      "Mükemmel ve sistemin tüm özelliklerini en iyi şekilde kullanıcıya aktaran Davet Maili Rehber İçeriği metni önerini yaz.",
    mailTip: "davet",
  },
  dashboard_karsilama_alt_metin: {
    varsayilanPrompt:
      "Kullanıcıyı sıcak ve davetkâr şekilde karşılayan, kısa ve etkili bir Dashboard Karşılama Alt Metni öner.",
    mailTip: null,
  },
};

export function aiAlanConfig(anahtar: string): AiAlanConfig | null {
  return AI_ALANLAR[anahtar] ?? null;
}
