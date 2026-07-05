/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand accent
        brand: {
          DEFAULT: "#6d5efc",
          dark: "#5646e0",
        },
        like: "#2ecc71",
        pass: "#e74c3c",
      },
      // Bind to Telegram theme params via CSS variables (set in telegram.ts)
      backgroundColor: {
        tg: "var(--tg-bg-color, #0f0f12)",
        "tg-secondary": "var(--tg-secondary-bg-color, #17171c)",
      },
      textColor: {
        tg: "var(--tg-text-color, #ffffff)",
        "tg-hint": "var(--tg-hint-color, #9a9aa5)",
      },
    },
  },
  plugins: [],
};
