import uz from "../locales/uz.json";
import ru from "../locales/ru.json";

export type Locale = "uz" | "ru";

const dictionaries: Record<Locale, Record<string, string>> = {
  uz: uz as Record<string, string>,
  ru: ru as Record<string, string>,
};

/**
 * Translate a string ID for a given locale. Falls back to Uzbek, then to the
 * key itself. Supports simple {placeholder} interpolation.
 */
export function t(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const dict = dictionaries[locale] ?? dictionaries.uz;
  let str = dict[key] ?? dictionaries.uz[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}

export function normalizeLocale(input?: string | null): Locale {
  return input === "ru" ? "ru" : "uz";
}
