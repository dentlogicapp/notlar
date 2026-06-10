import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  darkMode: "class",  // v11 — manuel toggle (UserMenu)
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "Georgia", "serif"],
      },
      colors: {
        // Açık tema — DEĞIŞMEDİ
        cream: {
          50:  "#fdfaf4",
          100: "#faf6ef",
          200: "#f3ebda",
          300: "#ebe3d4",
        },
        clay: {
          50:  "#f9f3ec",
          100: "#ede0d0",
          200: "#d9c1a3",
          300: "#c4a37e",
          400: "#a8825a",
          500: "#8a6541",
          600: "#6b4d31",
          700: "#4e3722",
          800: "#3d2817",
          900: "#2a1b0f",
        },
        terracotta: {
          DEFAULT: "#c4704d",
          dark: "#a85a3e",
          light: "#e89978",
        },
        gold: {
          DEFAULT: "#d4a661",
          dark: "#b88a4a",
        },
        rose: {
          50:  "#fdf2ef",
          100: "#fae0d8",
          200: "#f5c2b1",
        },
        // v11 — KOYU TEMA "ink" (warm-charcoal, davetiye stiliyle uyumlu)
        ink: {
          50:  "#ede2cf",  // primary text
          100: "#d6cab2",  // secondary
          200: "#bcae97",  // muted
          300: "#9a8e78",  // faint
          400: "#7d6f5a",  // tertiary
          500: "#5a4f3f",  // disabled
          600: "#3a302a",  // border-strong
          700: "#2d2520",  // border-base
          800: "#28201a",  // elevated (hover, popover üstü)
          850: "#1f1813",  // surface (kart, dialog)
          900: "#15110d",  // base (sayfa zemini)
        },
      },
      keyframes: {
        "heart-beat": {
          "0%":   { transform: "scale(1)" },
          "12%":  { transform: "scale(1.18)" },
          "24%":  { transform: "scale(1)" },
          "36%":  { transform: "scale(1.22)" },
          "48%":  { transform: "scale(1)" },
          "100%": { transform: "scale(1)" },
        },
        "fade-in": {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-red-bildirim": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(239, 68, 68, 0.45)" },
          "50%":      { boxShadow: "0 0 0 6px rgba(239, 68, 68, 0)" },
        },
        "shimmer": {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "heart-beat": "heart-beat 1.6s ease-in-out infinite",
        "fade-in": "fade-in 0.4s ease-out",
        "pulse-red-bildirim": "pulse-red-bildirim 2s ease-in-out infinite",
        "shimmer": "shimmer 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
