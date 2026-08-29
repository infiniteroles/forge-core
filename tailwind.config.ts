import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        "text-dim": "rgb(var(--text-dim) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "on-accent": "rgb(var(--on-accent) / <alpha-value>)",
        // Material 3 color roles
        m3: {
          primary: "rgb(var(--m3-primary) / <alpha-value>)",
          "on-primary": "rgb(var(--m3-on-primary) / <alpha-value>)",
          "primary-container": "rgb(var(--m3-primary-container) / <alpha-value>)",
          "on-primary-container": "rgb(var(--m3-on-primary-container) / <alpha-value>)",
          "surface-container-lowest": "rgb(var(--m3-surface-container-lowest) / <alpha-value>)",
          "surface-container-low": "rgb(var(--m3-surface-container-low) / <alpha-value>)",
          "surface-container": "rgb(var(--m3-surface-container) / <alpha-value>)",
          "surface-container-high": "rgb(var(--m3-surface-container-high) / <alpha-value>)",
          "surface-container-highest": "rgb(var(--m3-surface-container-highest) / <alpha-value>)",
          "on-surface": "rgb(var(--m3-on-surface) / <alpha-value>)",
          "on-surface-variant": "rgb(var(--m3-on-surface-variant) / <alpha-value>)",
          outline: "rgb(var(--m3-outline) / <alpha-value>)",
          "outline-variant": "rgb(var(--m3-outline-variant) / <alpha-value>)",
          error: "rgb(var(--m3-error) / <alpha-value>)",
          "on-error": "rgb(var(--m3-on-error) / <alpha-value>)",
          warning: "rgb(var(--m3-warning) / <alpha-value>)",
          info: "rgb(var(--m3-info) / <alpha-value>)",
        },
        // Identidad Forge CORE01 (colores directos)
        forge: {
          bg: "#080A0D",
          bgSoft: "#0B0E12",
          surface: "#0D1117",
          surfaceSoft: "#111821",
          surfaceMuted: "#151D27",
          surfaceRaised: "#18212D",
          text: "#F5F7FA",
          muted: "#A4ADB8",
          soft: "#737D8A",
          accent: "#7CFF4D",
          accentHover: "#8FFF63",
          accentActive: "#5EEA35",
          success: "#7CFF4D",
          warning: "#F6C85F",
          danger: "#FF5F57",
          info: "#7AA7FF",
        },
      },
      fontFamily: {
        sans: ["Geist", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Geist", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Geist Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        forge: "16px",
        forgeSm: "12px",
        forgeLg: "24px",
      },
    },
  },
  plugins: [],
};

export default config;
