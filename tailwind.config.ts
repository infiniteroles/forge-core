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
        },
      },
    },
  },
  plugins: [],
};

export default config;
