import { HeartCrack, Sparkles } from "lucide-react";
import { useT } from "../store/useStore";

/**
 * Shown when a FREE user reaches the daily like cap. Offers to upgrade to
 * Premium (unlimited likes) and explains the limit resets tomorrow.
 */
export function LikeLimitModal({
  limit,
  onUpgrade,
  onClose,
}: {
  limit: number;
  onUpgrade: () => void;
  onClose: () => void;
}) {
  const t = useT();

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-[var(--tg-secondary-bg-color)] p-7 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex justify-center">
          <HeartCrack className="h-12 w-12 text-amber-400" strokeWidth={2} />
        </div>

        <h2 className="text-2xl font-extrabold text-tg">{t("likeLimit.title")}</h2>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-tg-hint">
          {t("likeLimit.body", { limit })}
        </p>
        <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-tg-hint">
          {t("likeLimit.reset", { limit })}
        </p>

        {/* Primary: go Premium (unlimited) */}
        <button
          type="button"
          onClick={onUpgrade}
          className="premium-badge mt-6 flex w-full items-center justify-center gap-2 rounded-full px-5 py-4 text-base font-extrabold active:opacity-90"
        >
          <Sparkles className="h-5 w-5" />
          {t("likeLimit.unlimited")}
        </button>

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full py-2 text-sm font-semibold text-tg-hint active:opacity-70"
        >
          {t("likeLimit.close")}
        </button>
      </div>
    </div>
  );
}
