import { useState } from "react";
import { Gift, Zap, Star, X, Check } from "lucide-react";
import { useT } from "../store/useStore";
import { api } from "../lib/api";
import { haptics, openInvoice } from "../lib/telegram";

/**
 * "Present" / Boost sheet. Buying a present gives a 3-day boost (stay on top of
 * the feed). `targetUserId` is the buyer for a self-boost, or another user to
 * gift the boost to. Boosts STACK (each purchase adds 3 more days).
 */
export function PresentModal({
  targetUserId,
  targetName,
  isGift = false,
  priceStars,
  onPaid,
  onClose,
}: {
  targetUserId: string;
  targetName?: string;
  isGift?: boolean;
  priceStars: number;
  onPaid?: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);

  const pay = async () => {
    if (paying) return;
    setError(false);
    setPaying(true);
    haptics.impact("light");
    try {
      const { link } = await api.createBoostInvoice(targetUserId);
      const status = await openInvoice(link);
      if (status === "paid") {
        haptics.notify("success");
        setDone(true);
        onPaid?.();
      } else if (status === "failed") {
        haptics.notify("error");
        setError(true);
      }
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
        className="w-full rounded-t-3xl bg-[var(--tg-secondary-bg-color)] p-5 pb-8"
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
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-brand text-white">
            <Gift className="h-7 w-7" />
          </span>
          <h2 className="mt-3 text-xl font-extrabold text-tg">
            {isGift ? t("present.giftTitle") : t("present.title")}
          </h2>
          <p className="mt-1 max-w-xs text-sm text-tg-hint">
            {isGift
              ? t("present.giftSubtitle", { name: targetName || "" })
              : t("present.subtitle")}
          </p>
        </div>

        {/* What it does */}
        <div className="mt-5 space-y-3 rounded-2xl bg-[var(--tg-bg-color)] px-4 py-4">
          <Row icon={<Zap className="h-5 w-5 text-amber-400" />} text={t("present.f.top")} />
          <Row icon={<Star className="h-5 w-5 text-amber-400" fill="currentColor" />} text={t("present.f.stack")} />
        </div>

        {done ? (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-emerald-500/15 py-4 text-sm font-semibold text-emerald-300">
            <Check className="h-4 w-4" /> {t("present.done")}
          </div>
        ) : (
          <>
            {error && (
              <p className="mt-3 text-center text-xs text-pass">{t("present.error")}</p>
            )}
            <button
              type="button"
              disabled={paying}
              onClick={pay}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-brand px-4 py-4 font-bold text-white active:opacity-90 disabled:opacity-60"
            >
              {paying ? (
                t("present.processing")
              ) : (
                <>
                  {isGift ? t("present.sendCta") : t("present.buyCta")}
                  <span className="flex items-center gap-0.5">
                    · {priceStars} <Star className="h-4 w-4" fill="currentColor" />
                  </span>
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3">
      {icon}
      <span className="text-sm text-tg">{text}</span>
    </div>
  );
}
