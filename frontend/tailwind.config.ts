import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "Georgia", "serif"],
      },
      colors: {
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
      },
      animation: {
        "heart-beat": "heart-beat 1.6s ease-in-out infinite",
        "fade-in": "fade-in 0.4s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
