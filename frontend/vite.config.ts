import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: "dist",
    // Split large, rarely-changing vendor libs into their own chunks so they
    // cache independently of app code and load in parallel (faster repeat loads).
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "data-vendor": ["@tanstack/react-query", "zustand", "socket.io-client"],
        },
      },
    },
  },
});
