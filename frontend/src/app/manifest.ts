import type { MetadataRoute } from "next";

// PWA uygulama tanimi - "Ana Ekrana Ekle" sonrasi uygulama gibi acilir (tam ekran, ikon, splash)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Planlama Defteri",
    short_name: "Planlama Defteri",
    description: "Ekibini Kur, Birlikte Not Al, Planla, Tamamla",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf6ef",
    theme_color: "#c4704d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
