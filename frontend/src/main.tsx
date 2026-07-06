import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { StarBackground } from "./components/StarBackground";
import { initTelegram } from "./lib/telegram";
import "./index.css";

// Initialise Telegram runtime (theme, viewport, SDK) before rendering.
initTelegram();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <StarBackground />
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
