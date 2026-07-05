import { init as initSdk } from "@telegram-apps/sdk-react";

/**
 * Thin, robust wrapper around the Telegram Mini App runtime.
 *
 * We initialise @telegram-apps/sdk-react (per the project's chosen stack) and
 * then use the stable window.Telegram.WebApp surface for the concrete
 * integration points the app needs: raw initData (for auth), theme params,
 * viewport expansion, the hardware back button, and haptics. Using the raw
 * WebApp object keeps us resilient across SDK minor versions.
 *
 * Everything degrades gracefully when running OUTSIDE Telegram (e.g. in a
 * normal browser during development) so the UI still renders.
 */

function webApp(): TelegramWebApp | null {
  return typeof window !== "undefined" && window.Telegram?.WebApp
    ? window.Telegram.WebApp
    : null;
}

let initialised = false;

export function initTelegram(): void {
  if (initialised) return;
  initialised = true;

  // Initialise the SDK (safe no-op if not inside Telegram).
  try {
    initSdk();
  } catch {
    /* ignore — not running inside Telegram */
  }

  const wa = webApp();
  if (!wa) return;

  try {
    wa.ready();
    wa.expand();
  } catch {
    /* ignore */
  }

  applyTheme();
}

/** Map Telegram theme params onto CSS variables consumed by Tailwind. */
export function applyTheme(): void {
  const wa = webApp();
  const root = document.documentElement;
  const tp = wa?.themeParams ?? {};

  const set = (cssVar: string, value?: string, fallback?: string) => {
    root.style.setProperty(cssVar, value || fallback || "");
  };

  set("--tg-bg-color", tp.bg_color, "#0f0f12");
  set("--tg-secondary-bg-color", tp.secondary_bg_color, "#17171c");
  set("--tg-text-color", tp.text_color, "#ffffff");
  set("--tg-hint-color", tp.hint_color, "#9a9aa5");

  try {
    wa?.setBackgroundColor?.(tp.bg_color || "#0f0f12");
    wa?.setHeaderColor?.(tp.bg_color || "#0f0f12");
  } catch {
    /* ignore */
  }
}

/** Raw initData string — sent to the backend for HMAC validation. */
export function getInitData(): string {
  return webApp()?.initData ?? "";
}

/** Best-effort language code from Telegram (used as an initial default). */
export function getTelegramLanguageCode(): string | undefined {
  return webApp()?.initDataUnsafe?.user?.language_code;
}

/** Telegram user's first name — a nice default for the onboarding name field. */
export function getTelegramFirstName(): string | undefined {
  return webApp()?.initDataUnsafe?.user?.first_name;
}

// ---------- Back button ----------
let backCb: (() => void) | null = null;

export function showBackButton(cb: () => void): void {
  const wa = webApp();
  if (!wa) return;
  if (backCb) wa.BackButton.offClick(backCb);
  backCb = cb;
  wa.BackButton.onClick(cb);
  wa.BackButton.show();
}

export function hideBackButton(): void {
  const wa = webApp();
  if (!wa) return;
  if (backCb) wa.BackButton.offClick(backCb);
  backCb = null;
  wa.BackButton.hide();
}

// ---------- Haptics ----------
export const haptics = {
  impact(style: "light" | "medium" | "heavy" | "rigid" | "soft" = "light") {
    try {
      webApp()?.HapticFeedback.impactOccurred(style);
    } catch {
      /* ignore */
    }
  },
  notify(type: "error" | "success" | "warning") {
    try {
      webApp()?.HapticFeedback.notificationOccurred(type);
    } catch {
      /* ignore */
    }
  },
  select() {
    try {
      webApp()?.HapticFeedback.selectionChanged();
    } catch {
      /* ignore */
    }
  },
};
