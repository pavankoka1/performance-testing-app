import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        base: {
          900: "#121212",
          800: "#1E1E1E",
        },
      },
      boxShadow: {
        glow: "0 0 24px rgba(138, 43, 226, 0.2)",
      },
      backgroundImage: {
        "accent-gradient": "linear-gradient(135deg, #4B0082, #8A2BE2)",
      },
    },
  },
  plugins: [forms],
};

export default config;
