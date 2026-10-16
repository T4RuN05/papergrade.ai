import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#0075de",
        "primary-active": "#005bab",
        secondary: "#213183",
        "on-primary": "#ffffff",
        canvas: "#ffffff",
        "canvas-soft": "#f6f5f4",
        surface: "#ffffff",
        ink: "#000000",
        "ink-secondary": "#31302e",
        "ink-muted": "#615d59",
        "ink-faint": "#a39e98",
        hairline: "#e6e6e6",
        // Decorative Sticker Palette (DESIGN-notion.md)
        "accent-sky": "#62aef0",
        "accent-purple": "#d6b6f6",
        "accent-purple-deep": "#391c57",
        "accent-pink": "#ff64c8",
        "accent-orange": "#dd5b00",
        "accent-orange-deep": "#793400",
        "accent-teal": "#2a9d99",
        "accent-green": "#1aae39",
        "accent-brown": "#523410",
      },
      borderRadius: {
        xs: "4px",   // Form inputs & small tags
        sm: "5px",   // List rows & menu items
        md: "8px",   // Utility buttons & small cards
        lg: "12px",  // Feature cards & modals
        xl: "16px",  // Containers & wells
        full: "9999px", // Pill CTAs
      },
      boxShadow: {
        "notion-card": "0 0.175px 1.041px rgba(0,0,0,0.01), 0 0.8px 2.925px rgba(0,0,0,0.02), 0 2.025px 7.847px rgba(0,0,0,0.027), 0 4px 18px rgba(0,0,0,0.04)",
        "notion-modal": "0 23px 52px rgba(0,0,0,0.05), 0 8px 18px rgba(0,0,0,0.03)",
      },
    },
  },
  plugins: [],
};
export default config;
