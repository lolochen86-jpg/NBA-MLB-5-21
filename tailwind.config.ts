import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        skySoft: "#eaf6ff",
        ink: "#172033"
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans TC", "Arial", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
