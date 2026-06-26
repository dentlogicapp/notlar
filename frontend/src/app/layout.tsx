import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Providers } from "./providers";
import { MarkaBaslik } from "@/components/MarkaBaslik";
import { TEMA_INLINE_SCRIPT } from "@/lib/tema";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK"],
});

export const metadata: Metadata = {
  title: "Planlama Defterimiz",
  description: "Birlikte yapılacaklar, birlikte tamamlanacaklar",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className={`${inter.variable} ${fraunces.variable}`}>
      <head>
        {/* Tema flash önleme — CSS yüklenmeden önce html.dark class'ı ayarlanır */}
        <script dangerouslySetInnerHTML={{ __html: TEMA_INLINE_SCRIPT }} />
      </head>
      <body>
        <Providers>
          {/* v16 — document.title tek otoritesi (tenant marka adi + super admin prefix) */}
          <MarkaBaslik />
          {children}
        </Providers>
      </body>
    </html>
  );
}
