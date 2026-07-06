import { useState } from "react";
import { Globe, MapPin } from "lucide-react";
import { useStore, useT } from "../store/useStore";
import { Button } from "./ui";
import { haptics } from "../lib/telegram";

export interface Filters {
  minAge: number;
  maxAge: number;
  scope: "foryou" | "nearby";
  city?: string; // specific city key (overrides scope when set)
}

/**
 * Discovery filter sheet: age range + city (All / Nearby / a specific city).
 */
export function FilterModal({
  initial,
  onApply,
  onClose,
}: {
  initial: Filters;
  onApply: (f: Filters) => void;
  onClose: () => void;
}) {
  const t = useT();
  const cities = useStore((s) => s.me?.reference.cities ?? []);
  const [minAge, setMinAge] = useState(initial.minAge);
  const [maxAge, setMaxAge] = useState(initial.maxAge);
  // Single selection: "all" | "nearby" | <cityKey>
  const [sel, setSel] = useState<string>(
    initial.city ? initial.city : initial.scope === "nearby" ? "nearby" : "all",
  );

  const setMin = (v: number) => setMinAge(Math.min(v, maxAge));
  const setMax = (v: number) => setMaxAge(Math.max(v, minAge));

  const chip = (key: string, label: string, icon?: React.ReactNode) => (
    <button
      key={key}
      type="button"
      onClick={() => {
        haptics.select();
        setSel(key);
      }}
      className={`flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium ${
        sel === key ? "bg-brand text-white" : "bg-[var(--tg-bg-color)] text-tg"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-[var(--tg-secondary-bg-color)] p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <h2 className="mb-5 text-lg font-bold text-tg">{t("filter.title")}</h2>

        {/* Age range */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-tg-hint">{t("filter.age")}</span>
            <span className="text-sm font-bold text-brand">
              {minAge} – {maxAge}
            </span>
          </div>
          <label className="mb-1 block text-xs text-tg-hint">min</label>
          <input
            type="range"
            min={18}
            max={80}
            value={minAge}
            onChange={(e) => setMin(Number(e.target.value))}
            className="w-full"
            style={{ accentColor: "#ff2e9a" }}
          />
          <label className="mb-1 mt-2 block text-xs text-tg-hint">max</label>
          <input
            type="range"
            min={18}
            max={80}
            value={maxAge}
            onChange={(e) => setMax(Number(e.target.value))}
            className="w-full"
            style={{ accentColor: "#ff2e9a" }}
          />
        </div>

        {/* City */}
        <div className="mb-6">
          <span className="mb-2 block text-sm font-semibold text-tg-hint">
            {t("filter.city")}
          </span>
          <div className="flex flex-wrap gap-2">
            {chip("all", t("filter.allCities"), <Globe className="h-4 w-4" />)}
            {chip("nearby", t("filter.nearby"), <MapPin className="h-4 w-4" />)}
            {cities.map((c) => chip(c.value, c.label))}
          </div>
        </div>

        <Button
          onClick={() => {
            haptics.impact("light");
            const scope = sel === "nearby" ? "nearby" : "foryou";
            const city = sel !== "all" && sel !== "nearby" ? sel : undefined;
            onApply({ minAge, maxAge, scope, city });
          }}
        >
          {t("filter.apply")}
        </Button>
      </div>
    </div>
  );
}
