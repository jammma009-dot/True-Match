import { useState } from "react";
import { Gift, Check, X, Zap } from "lucide-react";
import { useT } from "../store/useStore";
import type { OwnProfile } from "../store/useStore";
import { api } from "../lib/api";
import { profileCompletenessPct } from "../lib/completeness";
import { haptics } from "../lib/telegram";

/**
 * "Free boost" reward sheet — fill your profile 100% to claim a one-time
 * free 1-day boost. Styled like the other reward/upsell cards.
 */
export function FreeBoostModal({
  profile,
  claimed,
  onClaimed,
  onClose,
}: {
  profile: OwnProfile | null | undefined;
  claimed: boolean;
  onClaimed: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const pct = profile ? profileCompletenessPct(profile) : 0;
  const complete = pct >= 100;
  const [claiming, setClaiming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const claim = async () => {
    if (claiming) return;
    setClaiming(true);
    setError(null);
    try {
      await api.claimFreeBoost();
      haptics.notify("success");
      setDone(true);
      onClaimed();
    } catch {
      haptics.notify("error");
      setError(t("freeBoost.error"));
    } finally {
      setClaiming(false);
    }
  };

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
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-brand text-white">
            <Gift className="h-7 w-7" />
          </span>
        </div>

        <h2 className="text-2xl font-extrabold text-tg">{t("freeBoost.title")}</h2>

        {claimed || done ? (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-emerald-500/15 py-4 text-sm font-semibold text-emerald-300">
            <Check className="h-4 w-4" />
            {done ? t("freeBoost.done") : t("freeBoost.alreadyClaimed")}
          </div>
        ) : (
          <>
            <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-tg-hint">
              {t("freeBoost.body")}
            </p>

            {/* Completion progress */}
            <div className="mt-5 rounded-2xl bg-[var(--tg-bg-color)] p-4 text-left">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-tg">{t("profile.complete")}</span>
                <span className="font-bold text-brand">{pct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand to-brand-dark transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {error && <p className="mt-3 text-xs text-pass">{error}</p>}

            <button
              type="button"
              disabled={!complete || claiming}
              onClick={claim}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-brand px-5 py-4 text-base font-extrabold text-white active:opacity-90 disabled:opacity-50"
            >
              <Zap className="h-5 w-5" />
              {complete ? t("freeBoost.claim") : t("freeBoost.incomplete")}
            </button>
          </>
        )}

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
