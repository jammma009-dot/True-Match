import { useState } from "react";
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
 * Native-style date picker with day / month / year columns, shown as a bottom
 * sheet. Uses simple selects for reliability across devices.
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

  const selectClass =
    "flex-1 rounded-xl bg-[var(--tg-bg-color)] px-2 py-3 text-center text-tg outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60">
      <div className="w-full rounded-t-3xl bg-[var(--tg-secondary-bg-color)] p-5">
        <p className="mb-4 text-center font-semibold text-tg">
          {t("onboarding.birthdate.select")}
        </p>
        <div className="mb-5 flex gap-2">
          <select
            className={selectClass}
            value={day}
            onChange={(e) => { haptics.select(); setDay(Number(e.target.value)); }}
          >
            {days.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            className={selectClass}
            value={month}
            onChange={(e) => { haptics.select(); setMonth(Number(e.target.value)); }}
          >
            {MONTHS_UZ.map((label, i) => (
              <option key={i} value={i + 1}>{label}</option>
            ))}
          </select>
          <select
            className={selectClass}
            value={year}
            onChange={(e) => { haptics.select(); setYear(Number(e.target.value)); }}
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() =>
              onConfirm({ day: Math.min(day, daysInMonth), month, year })
            }
          >
            {t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
