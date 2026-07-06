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

/**
 * Force a consistent, premium DARK theme regardless of the user's Telegram
 * light/dark setting. (We intentionally ignore Telegram's theme params so the
 * app never renders in a light theme.)
 */
const DARK = {
  bg: "#0b0b10",
  secondary: "#17171f",
  text: "#ffffff",
  hint: "#8b8b96",
};

export function applyTheme(): void {
  const wa = webApp();
  const root = document.documentElement;

  root.style.setProperty("--tg-bg-color", DARK.bg);
  root.style.setProperty("--tg-secondary-bg-color", DARK.secondary);
  root.style.setProperty("--tg-text-color", DARK.text);
  root.style.setProperty("--tg-hint-color", DARK.hint);
  root.style.colorScheme = "dark";

  try {
    wa?.setBackgroundColor?.(DARK.bg);
    wa?.setHeaderColor?.(DARK.bg);
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
