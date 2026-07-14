import { useState } from "react";
import { useStore, useT } from "../../store/useStore";
import { haptics } from "../../lib/telegram";

/**
 * Searchable city select. City list comes from the backend reference data
 * (fixed Uzbekistan cities), defaulting to Toshkent.
 */
export function CitySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (city: string) => void;
}) {
  const t = useT();
  const cities = useStore((s) => s.me?.reference.cities ?? []);
  const [query, setQuery] = useState("");

  const filtered = cities.filter((c) =>
    t(`city.${c.value}`).toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div>
      <input
        className="mb-3 w-full rounded-xl bg-[var(--tg-secondary-bg-color)] px-4 py-3 text-tg outline-none placeholder:text-tg-hint"
        placeholder={t("onboarding.city.searchPlaceholder")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {filtered.map((c) => {
          const selected = c.value === value;
          return (
            <button
              key={c.value}
              onClick={() => {
                haptics.select();
                onChange(c.value);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left ${
                selected
                  ? "bg-brand text-white"
                  : "bg-[var(--tg-secondary-bg-color)] text-tg"
              }`}
            >
              <span>{t(`city.${c.value}`)}</span>
              {selected && <span>✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
