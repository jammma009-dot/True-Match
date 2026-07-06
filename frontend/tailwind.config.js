/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand accent — warm romantic pink→orange (dating-app style).
        // `from-brand to-brand-dark` produces the signature pink→orange gradient.
        brand: {
          DEFAULT: "#fd267a",
          dark: "#ff6036",
        },
        like: "#2ecc71",
        pass: "#ff4458",
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
