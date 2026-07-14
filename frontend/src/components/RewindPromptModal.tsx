import { RotateCcw, Sparkles } from "lucide-react";
import { useT } from "../store/useStore";

/**
 * Shown when a FREE user taps "rewind" (go back). Rewind is a Premium feature,
 * so instead of jumping straight to checkout we explain it and offer to upgrade.
 */
export function RewindPromptModal({
  onUpgrade,
  onClose,
}: {
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
        className="w-full max-w-sm rounded-3xl border border-white/10 bg-[var(--tg-secondary-bg-color)] p-7 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/15">
            <RotateCcw className="h-8 w-8 text-amber-400" strokeWidth={2} />
          </span>
        </div>

        <h2 className="text-2xl font-extrabold text-tg">{t("rewindPrompt.title")}</h2>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-tg-hint">
          {t("rewindPrompt.body")}
        </p>

        <button
          type="button"
          onClick={onUpgrade}
          className="premium-badge mt-6 flex w-full items-center justify-center gap-2 rounded-full px-5 py-4 text-base font-extrabold active:opacity-90"
        >
          <Sparkles className="h-5 w-5" />
          {t("rewindPrompt.cta")}
        </button>

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
