import { useEffect, useState } from "react";
import { Gift, X, Copy, Check, Share2, Users } from "lucide-react";
import { useT } from "../store/useStore";
import { api } from "../lib/api";
import { haptics, openTelegramLink } from "../lib/telegram";

/**
 * "Invite friends" sheet. Shows the user's personal invite link (built from
 * their own Telegram id, no extra signup needed), lets them copy or share it,
 * and shows how many friends have joined so far. Each approved friend gives
 * the inviter +1 day of Boost (granted server-side once the friend's profile
 * is approved — see backend/src/referral).
 */
export function ReferralModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState<string | null>(null);
  const [approvedCount, setApprovedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getReferralSummary()
      .then((res) => {
        if (cancelled) return;
        setLink(res.link);
        setApprovedCount(res.approvedCount);
        setPendingCount(res.pendingCount);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const copyLink = async () => {
    if (!link) return;
    haptics.impact("light");
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — ignore, the link is still shown/selectable */
    }
  };

  const shareLink = () => {
    if (!link) return;
    haptics.impact("light");
    const text = encodeURIComponent(t("referral.shareText"));
    openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${text}`);
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
          <h2 className="mt-3 text-xl font-extrabold text-tg">{t("referral.modalTitle")}</h2>
          <p className="mt-1 max-w-xs text-sm text-tg-hint">{t("referral.modalSubtitle")}</p>
        </div>

        {/* Stats */}
        {(approvedCount > 0 || pendingCount > 0) && (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-[var(--tg-bg-color)] px-4 py-3 text-sm text-tg">
            <Users className="h-4 w-4 text-brand" />
            <span>{t("referral.approvedCount", { count: approvedCount })}</span>
            {pendingCount > 0 && (
              <span className="text-tg-hint">· {t("referral.pendingCount", { count: pendingCount })}</span>
            )}
          </div>
        )}

        {/* Link */}
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold text-tg-hint">{t("referral.linkLabel")}</p>
          {loading ? (
            <div className="rounded-2xl bg-[var(--tg-bg-color)] px-4 py-4 text-sm text-tg-hint">
              {t("referral.loading")}
            </div>
          ) : link ? (
            <div className="flex items-center gap-2 rounded-2xl bg-[var(--tg-bg-color)] px-4 py-3">
              <span className="flex-1 truncate text-sm text-tg">{link}</span>
            </div>
          ) : (
            <div className="rounded-2xl bg-[var(--tg-bg-color)] px-4 py-4 text-sm text-tg-hint">
              {t("referral.unavailable")}
            </div>
          )}
        </div>

        {link && (
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={copyLink}
              className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--tg-bg-color)] px-4 py-3.5 font-semibold text-tg active:opacity-80"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-400" /> {t("referral.copied")}
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> {t("referral.copy")}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={shareLink}
              className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-brand px-4 py-3.5 font-semibold text-white active:opacity-90"
            >
              <Share2 className="h-4 w-4" /> {t("referral.share")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
