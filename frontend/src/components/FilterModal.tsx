import { useState } from "react";
import { Globe, MapPin } from "lucide-react";
import { useT } from "../store/useStore";
import { Button } from "./ui";
import { haptics } from "../lib/telegram";

export interface Filters {
  minAge: number;
  maxAge: number;
  scope: "foryou" | "nearby";
}

/**
 * Discovery filter sheet: age range + city scope (all cities / nearby).
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
  const [minAge, setMinAge] = useState(initial.minAge);
  const [maxAge, setMaxAge] = useState(initial.maxAge);
  const [scope, setScope] = useState<"foryou" | "nearby">(initial.scope);

  const setMin = (v: number) => setMinAge(Math.min(v, maxAge));
  const setMax = (v: number) => setMaxAge(Math.max(v, minAge));

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl bg-[var(--tg-secondary-bg-color)] p-5 pb-8"
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

        {/* City scope */}
        <div className="mb-6">
          <span className="mb-2 block text-sm font-semibold text-tg-hint">
            {t("filter.city")}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                haptics.select();
                setScope("foryou");
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium ${
                scope === "foryou" ? "bg-brand text-white" : "bg-[var(--tg-bg-color)] text-tg"
              }`}
            >
              <Globe className="h-4 w-4" /> {t("filter.allCities")}
            </button>
            <button
              type="button"
              onClick={() => {
                haptics.select();
                setScope("nearby");
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium ${
                scope === "nearby" ? "bg-brand text-white" : "bg-[var(--tg-bg-color)] text-tg"
              }`}
            >
              <MapPin className="h-4 w-4" /> {t("filter.nearby")}
            </button>
          </div>
        </div>

        <Button
          onClick={() => {
            haptics.impact("light");
            onApply({ minAge, maxAge, scope });
          }}
        >
          {t("filter.apply")}
        </Button>
      </div>
    </div>
  );
}
