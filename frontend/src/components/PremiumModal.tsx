import { Star, CreditCard, X } from "lucide-react";
import { useT } from "../store/useStore";
import { haptics, openTelegramLink } from "../lib/telegram";

/**
 * Buy Premium sheet: choose Telegram Stars (coming soon) or pay via card
 * (forwards to the responsible person's Telegram).
 */
export function PremiumModal({
  paymentUsername,
  onClose,
}: {
  paymentUsername: string | null;
  onClose: () => void;
}) {
  const t = useT();

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl bg-[var(--tg-secondary-bg-color)] p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold text-tg">{t("premium.title")}</h2>
          <button onClick={onClose} className="text-tg-hint active:opacity-70">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-5 text-sm text-tg-hint">{t("premium.subtitle")}</p>

        {/* Telegram Stars — coming soon (disabled) */}
        <button
          type="button"
          disabled
          className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-[var(--tg-bg-color)] px-4 py-4 text-left opacity-60"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-400/20 text-amber-300">
            <Star className="h-5 w-5" fill="currentColor" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold text-tg">{t("premium.stars")}</span>
            <span className="block text-xs text-tg-hint">{t("premium.starsSoon")}</span>
          </span>
        </button>

        {/* Pay via card — forward to responsible person */}
        <button
          type="button"
          disabled={!paymentUsername}
          onClick={() => {
            if (!paymentUsername) return;
            haptics.impact("light");
            openTelegramLink(`https://t.me/${paymentUsername}`);
            onClose();
          }}
          className="flex w-full items-center gap-3 rounded-2xl bg-brand px-4 py-4 text-left text-white active:opacity-80 disabled:opacity-50"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
            <CreditCard className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">{t("premium.card")}</span>
            <span className="block text-xs text-white/80">{t("premium.cardHint")}</span>
          </span>
        </button>
      </div>
    </div>
  );
}
