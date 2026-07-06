import { useEffect, useRef, useState } from "react";
import { useT } from "../../store/useStore";
import { Button } from "../../components/ui";
import { haptics } from "../../lib/telegram";

export interface DateValue {
  day: number;
  month: number;
  year: number;
}

const MONTHS_UZ = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];

function range(from: number, to: number): number[] {
  const out: number[] = [];
  if (from <= to) for (let i = from; i <= to; i++) out.push(i);
  else for (let i = from; i >= to; i--) out.push(i);
  return out;
}

/**
 * Custom, fully-themed date picker (no native <select> — so no white system
 * dropdowns). Three scrollable columns: day / month / year.
 */
export function DatePicker({
  value,
  onConfirm,
  onClose,
}: {
  value: DateValue | null;
  onConfirm: (v: DateValue) => void;
  onClose: () => void;
}) {
  const t = useT();
  const now = new Date();
  const [day, setDay] = useState(value?.day ?? 1);
  const [month, setMonth] = useState(value?.month ?? 1);
  const [year, setYear] = useState(value?.year ?? now.getFullYear() - 20);

  const years = range(now.getFullYear() - 18, 1950);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = range(1, daysInMonth);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl bg-[var(--tg-secondary-bg-color)] p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <p className="mb-4 text-center font-semibold text-tg">
          {t("onboarding.birthdate.select")}
        </p>

        <div className="mb-5 flex gap-2">
          <Column
            values={days}
            value={Math.min(day, daysInMonth)}
            onChange={setDay}
            label={t("onboarding.birthdate.day")}
          />
          <Column
            values={range(1, 12)}
            value={month}
            onChange={setMonth}
            format={(m) => MONTHS_UZ[m - 1]}
            label={t("onboarding.birthdate.month")}
            wide
          />
          <Column
            values={years}
            value={year}
            onChange={setYear}
            label={t("onboarding.birthdate.year")}
          />
        </div>

        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => onConfirm({ day: Math.min(day, daysInMonth), month, year })}>
            {t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Column({
  values,
  value,
  onChange,
  format,
  label,
  wide = false,
}: {
  values: number[];
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  label: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Center the selected item once when opened.
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const sel = c.querySelector('[data-sel="true"]') as HTMLElement | null;
    if (sel) c.scrollTop = sel.offsetTop - c.clientHeight / 2 + sel.clientHeight / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={wide ? "flex-[1.4]" : "flex-1"}>
      <p className="mb-1 text-center text-xs text-tg-hint">{label}</p>
      <div
        ref={ref}
        className="relative h-44 overflow-y-auto rounded-xl bg-[var(--tg-bg-color)] py-16"
      >
        {values.map((v) => {
          const selected = v === value;
          return (
            <button
              key={v}
              type="button"
              data-sel={selected}
              onClick={() => {
                haptics.select();
                onChange(v);
              }}
              className={`block w-full py-2 text-center transition-colors ${
                selected
                  ? "text-lg font-bold text-brand"
                  : "text-base text-tg-hint"
              }`}
            >
              {format ? format(v) : v}
            </button>
          );
        })}
      </div>
    </div>
  );
}
