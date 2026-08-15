import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0b0b0f",
        surface: "#14141b",
        "surface-2": "#1b1b24",
        border: "#262630",
        "text-dim": "#8b8b98",
        accent: "#ff6b57",
      },
    },
  },
  plugins: [],
};

export default config;
