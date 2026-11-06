import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "var(--primary)",
        "primary-active": "var(--primary-active)",
        secondary: "var(--secondary)",
        "on-primary": "var(--on-primary)",
        canvas: "var(--canvas)",
        "canvas-soft": "var(--canvas-soft)",
        surface: "var(--surface)",
        "surface-elevated": "var(--surface-elevated)",
        ink: "var(--ink)",
        "ink-secondary": "var(--ink-secondary)",
        "ink-muted": "var(--ink-muted)",
        "ink-faint": "var(--ink-faint)",
        hairline: "var(--hairline)",
        "hairline-subtle": "var(--hairline-subtle)",
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
        "notion-card": "var(--shadow-notion-card)",
        "notion-modal": "var(--shadow-notion-modal)",
      },
    },
  },
  plugins: [],
};
export default config;
