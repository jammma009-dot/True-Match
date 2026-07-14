import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, MapPin, MessageCircle, Lock } from "lucide-react";
import { api, MatchListItem } from "../lib/api";
import { useStore, useT } from "../store/useStore";
import { LogoHeader } from "../components/LogoHeader";
import { Spinner } from "../components/ui";
import { PremiumModal } from "../components/PremiumModal";
import { PremiumBadge } from "../components/PremiumBadge";
import { haptics } from "../lib/telegram";

/**
 * Likes tab — people who liked the current user.
 * • PREMIUM users (any gender): all photos revealed, tapping likes back →
 *   instant match → chat (they already liked you, so it always matches).
 * • FREE FEMALE users: the first N likers (see backend `unlockedCount`) are
 *   shown unblurred and can be liked back; the rest are blurred/locked.
 * • FREE MALE users: every liker is blurred/locked regardless of count.
 */
export function LikesScreen({
  onMatch,
}: {
  onMatch: (m: MatchListItem) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const me = useStore((s) => s.me);
  const isPremium = me?.user.isPremium ?? false;
  const paymentUsername = me?.settings?.paymentUsername ?? null;
  const premiumPlans = me?.settings?.premiumPlans ?? [];
  const priceStars = premiumPlans[0]?.priceStars ?? 250;

  const [showPremium, setShowPremium] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["likes"],
    queryFn: api.getLikes,
  });
  const likes = data?.likes ?? [];
  const unlockedCount = data?.unlockedCount ?? 0;

  /** Whether this card (by position in the list) is viewable without Premium. */
  const isUnlocked = (index: number) => isPremium || index < unlockedCount;

  const likeBack = async (p: (typeof likes)[number]) => {
    if (busy) return;
    setBusy(p.userId);
    haptics.impact("medium");
    try {
      const res = await api.swipe(p.userId, "like");
      if (res.matched && res.matchId) {
        haptics.notify("success");
        onMatch({
          matchId: res.matchId,
          createdAt: new Date().toISOString(),
          user: {
            userId: p.userId,
            name: p.name,
            age: p.age,
            city: p.city,
            cityLabel: p.cityLabel,
            photo: p.photos[0]?.url ?? null,
          },
          lastMessage: null,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["likes"] });
      queryClient.invalidateQueries({ queryKey: ["matches"] });
    } catch {
      haptics.notify("error");
    } finally {
      setBusy(null);
    }
  };

  const onCardTap = (p: (typeof likes)[number], index: number) => {
    if (isUnlocked(index)) likeBack(p);
    else {
      haptics.impact("light");
      setShowPremium(true);
    }
  };

  return (
    <div className="min-h-full px-4 pb-6">
      <LogoHeader />
      <h1 className="flex items-center gap-2 text-xl font-bold text-tg">
        {t("likes.title")}
        {isPremium && <PremiumBadge />}
      </h1>
      <p className="mb-4 text-sm text-tg-hint">
        {isPremium ? t("likes.subtitlePremium") : t("likes.subtitle")}
      </p>

      {isLoading ? (
        <Spinner />
      ) : likes.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-8 pt-20 text-center text-tg-hint">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-pink-500/20 to-brand/10">
            <Heart className="h-9 w-9 text-pink-400" fill="currentColor" />
          </div>
          <p className="max-w-xs">{t("likes.empty")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {likes.map((p, index) => {
            const unlocked = isUnlocked(index);
            return (
              <button
                key={p.userId}
                type="button"
                onClick={() => onCardTap(p, index)}
                disabled={busy === p.userId}
                className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-[var(--tg-secondary-bg-color)] text-left active:opacity-90 disabled:opacity-60"
              >
                {p.photos[0] ? (
                  <img
                    src={p.photos[0].url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={`h-full w-full object-cover ${
                      unlocked ? "" : "scale-110 blur-xl"
                    }`}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-4xl">
                    👤
                  </div>
                )}

                {/* Center action / lock */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {unlocked ? (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/90 shadow-lg backdrop-blur">
                      {busy === p.userId ? (
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <MessageCircle className="h-6 w-6 text-white" />
                      )}
                    </div>
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 backdrop-blur">
                      <Lock className="h-5 w-5 text-white" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3">
                  {unlocked ? (
                    <>
                      <p className="text-sm font-bold text-white">
                        {p.name}, {p.age}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-white/75">
                        <MapPin className="h-3 w-3" /> {t(`city.${p.city}`)}
                      </p>
                    </>
                  ) : (
                    <p className="text-center text-[11px] font-semibold text-white/90">
                      {t("likes.locked")}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showPremium && (
        <PremiumModal
          paymentUsername={paymentUsername}
          priceStars={priceStars}
          isPremium={isPremium}
          onPaid={() => {
            queryClient.invalidateQueries({ queryKey: ["me"] });
            window.setTimeout(
              () => queryClient.invalidateQueries({ queryKey: ["me"] }),
              1500,
            );
          }}
          onClose={() => setShowPremium(false)}
        />
      )}
    </div>
  );
}
