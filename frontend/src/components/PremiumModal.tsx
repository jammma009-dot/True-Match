import { useMemo, useState } from "react";
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
import { useT, useStore } from "../store/useStore";
import { api } from "../lib/api";
import { haptics, openTelegramLink, openInvoice } from "../lib/telegram";
import { CardPaymentPanel } from "./CardPaymentPanel";

const FEATURES = [
  { icon: Heart, titleKey: "premium.f.likes.title", descKey: "premium.f.likes.desc" },
  { icon: Gift, titleKey: "premium.f.gift.title", descKey: "premium.f.gift.desc" },
  { icon: RotateCcw, titleKey: "premium.f.rewind.title", descKey: "premium.f.rewind.desc" },
  { icon: Zap, titleKey: "premium.f.priority.title", descKey: "premium.f.priority.desc" },
  { icon: Send, titleKey: "premium.f.telegram.title", descKey: "premium.f.telegram.desc" },
] as const;

/**
 * Buy Premium sheet: shows the Premium advantages, lets the user pick one of
 * up to 4 admin-configured plans (period + price), then pay with Telegram
 * Stars (real invoice) or via card (automated order or forwarded chat).
 */
export function PremiumModal({
  paymentUsername,
  priceStars,
  isPremium = false,
  onPaid,
  onClose,
}: {
  paymentUsername: string | null;
  /** @deprecated kept for older call sites; ignored once `settings.premiumPlans` is available. */
  priceStars?: number;
  isPremium?: boolean;
  onPaid?: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const cardNumber = useStore((s) => s.me?.settings?.cardNumber ?? null);
  const plans = useStore(
    (s) => s.me?.settings?.premiumPlans ?? [{ days: 30, priceStars: priceStars ?? 250, priceUzs: 20000 }],
  );
  const [selectedDays, setSelectedDays] = useState<number>(
    plans.find((p) => p.days === 30)?.days ?? plans[0]?.days ?? 30,
  );
  const selectedPlan = useMemo(
    () => plans.find((p) => p.days === selectedDays) ?? plans[0],
    [plans, selectedDays],
  );

  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<"options" | "card">("options");

  const payWithStars = async () => {
    if (paying) return;
    setError(false);
    setPaying(true);
    haptics.impact("light");
    try {
      const { link } = await api.createPremiumInvoice(selectedPlan.days);
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

        {mode === "card" ? (
          <CardPaymentPanel
            createOrder={() => api.createPremiumCardOrder(selectedPlan.days)}
            onPaid={onPaid}
            onBack={() => setMode("options")}
          />
        ) : (
          <>
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

            {/* Plan picker — only shown when the admin configured more than one plan */}
            {plans.length > 1 && (
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {plans.map((plan) => {
                  const active = plan.days === selectedPlan.days;
                  return (
                    <button
                      key={plan.days}
                      type="button"
                      onClick={() => {
                        haptics.impact("light");
                        setSelectedDays(plan.days);
                      }}
                      className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center transition ${
                        active
                          ? "border-amber-400 bg-amber-400/15"
                          : "border-white/10 bg-[var(--tg-bg-color)]"
                      }`}
                    >
                      {/* Label — plan name / duration */}
                      <p
                        className={`text-xs font-semibold leading-tight ${
                          active ? "text-amber-300" : "text-tg"
                        }`}
                      >
                        {plan.label ?? t("premium.planDays", { days: plan.days })}
                      </p>
                      {/* UZS price — distinct, muted style */}
                      <p className="text-[11px] font-medium leading-tight text-tg-hint">
                        {plan.priceUzs.toLocaleString("en-US")} {t("card.som")}
                      </p>
                      {/* Stars price — distinct, accented style */}
                      <p className="flex items-center justify-center gap-0.5 text-[11px] font-bold leading-tight text-amber-400">
                        {plan.priceStars} <Star className="h-2.5 w-2.5" fill="currentColor" />
                      </p>
                    </button>
                  );
                })}
              </div>
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
                  {paying
                    ? t("premium.processing")
                    : t("premium.starsPrice", {
                        price: selectedPlan.priceStars,
                        days: selectedPlan.days,
                      })}
                </span>
              </span>
              <span className="flex items-center gap-0.5 font-extrabold">
                {selectedPlan.priceStars} <Star className="h-4 w-4" fill="currentColor" />
              </span>
            </button>

            {/* Pay via card — automated order flow if a card is configured,
                otherwise fall back to forwarding to the responsible person. */}
            <button
              type="button"
              disabled={!cardNumber && !paymentUsername}
              onClick={() => {
                haptics.impact("light");
                if (cardNumber) {
                  setMode("card");
                  return;
                }
                if (!paymentUsername) return;
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
                <span className="block text-xs text-tg-hint">
                  {cardNumber ? t("card.hintAuto") : t("premium.cardHint")}
                </span>
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
