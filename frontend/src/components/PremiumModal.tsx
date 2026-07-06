import { useState } from "react";
import {
  Crown,
  Heart,
  Gift,
  RotateCcw,
  Zap,
  Send,
  Star,
  CreditCard,
  X,
  Check,
} from "lucide-react";
import { useT } from "../store/useStore";
import { api } from "../lib/api";
import { haptics, openTelegramLink, openInvoice } from "../lib/telegram";

const FEATURES = [
  { icon: Heart, titleKey: "premium.f.likes.title", descKey: "premium.f.likes.desc" },
  { icon: Gift, titleKey: "premium.f.gift.title", descKey: "premium.f.gift.desc" },
  { icon: RotateCcw, titleKey: "premium.f.rewind.title", descKey: "premium.f.rewind.desc" },
  { icon: Zap, titleKey: "premium.f.priority.title", descKey: "premium.f.priority.desc" },
  { icon: Send, titleKey: "premium.f.telegram.title", descKey: "premium.f.telegram.desc" },
] as const;

/**
 * Buy Premium sheet: shows the Premium advantages, then lets the user pay with
 * Telegram Stars (real invoice) or via card (forwarded to the responsible
 * person's Telegram).
 */
export function PremiumModal({
  paymentUsername,
  priceStars,
  isPremium = false,
  onPaid,
  onClose,
}: {
  paymentUsername: string | null;
  priceStars: number;
  isPremium?: boolean;
  onPaid?: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(false);

  const payWithStars = async () => {
    if (paying) return;
    setError(false);
    setPaying(true);
    haptics.impact("light");
    try {
      const { link } = await api.createPremiumInvoice();
      const status = await openInvoice(link);
      if (status === "paid") {
        haptics.notify("success");
        onPaid?.();
        onClose();
      } else if (status === "failed") {
        haptics.notify("error");
        setError(true);
      }
      // "cancelled" / "pending" / "unsupported": leave the sheet open silently.
    } catch {
      haptics.notify("error");
      setError(true);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-[var(--tg-secondary-bg-color)] p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <button
          onClick={onClose}
          className="absolute right-5 text-tg-hint active:opacity-70"
          aria-label="close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <span className="premium-badge flex h-14 w-14 items-center justify-center rounded-full">
            <Crown className="h-7 w-7" fill="currentColor" />
          </span>
          <h2 className="mt-3 bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-2xl font-extrabold text-transparent">
            {t("premium.title")}
          </h2>
          <p className="mt-1 text-sm text-tg-hint">{t("premium.subtitle")}</p>
        </div>

        {/* Features */}
        <div className="mt-5 rounded-2xl bg-[var(--tg-bg-color)] px-4">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.titleKey}
                className={`flex items-start gap-3 py-3.5 ${
                  i > 0 ? "border-t border-white/5" : ""
                }`}
              >
                <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-semibold text-tg">{t(f.titleKey)}</p>
                  <p className="text-xs text-tg-hint">{t(f.descKey)}</p>
                </div>
              </div>
            );
          })}
        </div>

        {isPremium && (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-amber-400/15 py-3 text-sm font-semibold text-amber-300">
            <Check className="h-4 w-4" /> {t("premium.active")}
          </div>
        )}

        {error && (
          <p className="mt-3 text-center text-xs text-pass">{t("premium.error")}</p>
        )}

        {/* Pay with Telegram Stars — real invoice */}
        <button
          type="button"
          disabled={paying}
          onClick={payWithStars}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-4 text-left text-amber-950 active:opacity-90 disabled:opacity-60"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/15">
            <Star className="h-5 w-5" fill="currentColor" />
          </span>
          <span className="flex-1">
            <span className="block font-bold">{t("premium.stars")}</span>
            <span className="block text-xs opacity-80">
              {paying ? t("premium.processing") : t("premium.starsPrice", { price: priceStars })}
            </span>
          </span>
          <span className="flex items-center gap-0.5 font-extrabold">
            {priceStars} <Star className="h-4 w-4" fill="currentColor" />
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
          className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-[var(--tg-bg-color)] px-4 py-4 text-left active:opacity-80 disabled:opacity-50"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/20 text-brand">
            <CreditCard className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold text-tg">{t("premium.card")}</span>
            <span className="block text-xs text-tg-hint">{t("premium.cardHint")}</span>
          </span>
        </button>
      </div>
    </div>
  );
}
