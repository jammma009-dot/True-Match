import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, HeartCrack, Gift, MapPin, Sparkles, RefreshCw, MoreVertical, Ruler, SlidersHorizontal, RotateCcw } from "lucide-react";
import { api, ApiError, PublicProfile, MatchListItem } from "../lib/api";
import { useStore, useT } from "../store/useStore";
import { INTEREST_ICON, SmokingIcon, DrinkingIcon } from "../lib/profileMeta";
import { LogoHeader } from "../components/LogoHeader";
import { FilterModal } from "../components/FilterModal";
import { PremiumBadge } from "../components/PremiumBadge";
import { PremiumModal } from "../components/PremiumModal";
import { LikeLimitModal } from "../components/LikeLimitModal";
import { haptics } from "../lib/telegram";
import { ReportBlockModal } from "../components/ReportBlockModal";

const SWIPE_THRESHOLD = 90; // px of horizontal drag to count as a swipe
const TAP_SLOP = 10; // px of movement below which we treat it as a tap

export function DiscoverScreen({
  onMatch,
}: {
  onMatch: (m: MatchListItem) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const me = useStore((s) => s.me);
  const isPremium = me?.user.isPremium ?? false;
  const paymentUsername = me?.settings?.paymentUsername ?? null;
  const priceStars = me?.settings?.premiumPriceStars ?? 250;
  const [showPremium, setShowPremium] = useState(false);
  const [limitHit, setLimitHit] = useState<number | null>(null);
  const [rewinding, setRewinding] = useState(false);
  const [feedTab, setFeedTab] = useState<"foryou" | "nearby">("foryou");
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(80);
  const [city, setCity] = useState<string>("");
  const [showFilter, setShowFilter] = useState(false);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["discovery", feedTab, minAge, maxAge, city],
    queryFn: () => api.getDiscovery({ scope: feedTab, minAge, maxAge, city: city || undefined }),
  });

  const [queue, setQueue] = useState<PublicProfile[]>([]);
  const [index, setIndex] = useState(0);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Drag / animation state
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [leaving, setLeaving] = useState<null | "like" | "pass">(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (data?.queue) {
      setQueue(data.queue);
      setIndex(0);
      setPhotoIdx(0);
    }
  }, [data]);

  const current = queue[index];

  const advance = () => {
    setPhotoIdx(0);
    setExpanded(false);
    setIndex((i) => {
      const next = i + 1;
      if (next >= queue.length) {
        refetch();
        return 0;
      }
      return next;
    });
  };

  const triggerSwipe = (action: "like" | "pass") => {
    if (!current || busyRef.current || leaving) return;
    busyRef.current = true;
    setLeaving(action);
    haptics.impact(action === "like" ? "medium" : "light");

    const swiped = current;

    // Fire the network call during the fly-off animation.
    api
      .swipe(swiped.userId, action)
      .then((res) => {
        if (res.matched && res.matchId) {
          haptics.notify("success");
          onMatch({
            matchId: res.matchId,
            createdAt: new Date().toISOString(),
            user: {
              userId: swiped.userId,
              name: swiped.name,
              age: swiped.age,
              city: swiped.city,
              cityLabel: swiped.cityLabel,
              photo: swiped.photos[0]?.url ?? null,
            },
            lastMessage: null,
          });
        }
      })
      .catch((err) => {
        // Free daily-like cap reached → show the limit sheet. The like was NOT
        // recorded server-side, so refetching brings the person back.
        if (err instanceof ApiError && err.code === "like_limit") {
          haptics.notify("warning");
          const lim =
            typeof err.data?.limit === "number" ? err.data.limit : 20;
          setLimitHit(lim);
          refetch();
        }
      })
      .finally(() => {
        // If they liked back someone who liked them, refresh the Likes list.
        queryClient.invalidateQueries({ queryKey: ["likes"] });
      });

    window.setTimeout(() => {
      advance();
      setLeaving(null);
      setDrag({ x: 0, y: 0, active: false });
      busyRef.current = false;
    }, 300);
  };

  // Rewind the last swipe (Premium only).
  const doRewind = async () => {
    if (rewinding || busyRef.current || leaving) return;
    if (!isPremium) {
      haptics.notify("warning");
      setShowPremium(true);
      return;
    }
    setRewinding(true);
    haptics.impact("light");
    try {
      const { profile } = await api.rewind();
      if (profile) {
        // Re-show the rewound person as the current card.
        setQueue((q) => {
          const copy = [...q];
          copy.splice(index, 0, profile);
          return copy;
        });
        setPhotoIdx(0);
        setExpanded(false);
        queryClient.invalidateQueries({ queryKey: ["likes"] });
        queryClient.invalidateQueries({ queryKey: ["matches"] });
      }
    } catch {
      /* nothing to rewind / not available */
    } finally {
      setRewinding(false);
    }
  };

  // ---- Pointer (drag + tap) handling on the card ----
  const onPointerDown = (e: React.PointerEvent) => {
    if (leaving) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    setDrag({ x: 0, y: 0, active: true });
    cardRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    setDrag({
      x: e.clientX - startRef.current.x,
      y: e.clientY - startRef.current.y,
      active: true,
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!startRef.current || !current) {
      setDrag({ x: 0, y: 0, active: false });
      return;
    }
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    const dist = Math.hypot(dx, dy);
    startRef.current = null;

    if (dist < TAP_SLOP) {
      // Treat as a tap → cycle photos based on where they tapped.
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect && current.photos.length > 1) {
        const rel = (e.clientX - rect.left) / rect.width;
        if (rel < 0.4) {
          setPhotoIdx((p) => (p - 1 + current.photos.length) % current.photos.length);
        } else {
          setPhotoIdx((p) => (p + 1) % current.photos.length);
        }
        haptics.select();
      }
      setDrag({ x: 0, y: 0, active: false });
      return;
    }

    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      triggerSwipe(dx > 0 ? "like" : "pass");
    } else {
      // Snap back
      setDrag({ x: 0, y: 0, active: false });
    }
  };

  // ---- Render states ----
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  if (!current) {
    const filtersActive = minAge > 18 || maxAge < 80 || !!city;
    return (
      <div className="flex h-full flex-col">
        <LogoHeader />
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--tg-secondary-bg-color)]">
            <Sparkles className="h-9 w-9 text-brand" />
          </div>
          <p className="mb-2 max-w-xs text-tg-hint">{t("discover.empty")}</p>
          <p className="mb-6 max-w-xs text-sm text-tg-hint/80">
            {t("discover.emptyFilterHint")}
          </p>
          <button
            onClick={() => {
              haptics.impact("light");
              setShowFilter(true);
            }}
            className={`mb-3 flex items-center gap-2 rounded-full px-5 py-2.5 font-semibold active:opacity-80 ${
              filtersActive
                ? "bg-brand text-white"
                : "bg-[var(--tg-secondary-bg-color)] text-tg"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {t("discover.adjustFilters")}
          </button>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 rounded-full bg-[var(--tg-secondary-bg-color)] px-5 py-2.5 font-medium text-tg active:opacity-70"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            {t("common.retry")}
          </button>
        </div>

        {showFilter && (
          <FilterModal
            initial={{ minAge, maxAge, scope: feedTab, city: city || undefined }}
            onApply={(f) => {
              setFeedTab(f.scope);
              setMinAge(f.minAge);
              setMaxAge(f.maxAge);
              setCity(f.city ?? "");
              setShowFilter(false);
            }}
            onClose={() => setShowFilter(false)}
          />
        )}
      </div>
    );
  }

  const photo = current.photos[photoIdx]?.url ?? current.photos[0]?.url;

  // Card transform
  const transform = leaving
    ? `translateX(${leaving === "like" ? 130 : -130}%) rotate(${leaving === "like" ? 20 : -20}deg)`
    : `translate(${drag.x}px, ${drag.y * 0.15}px) rotate(${drag.x / 22}deg)`;
  const transition = drag.active ? "none" : "transform 0.3s cubic-bezier(0.22,1,0.36,1)";

  const likeOpacity = leaving === "like" ? 1 : Math.min(1, Math.max(0, drag.x / SWIPE_THRESHOLD));
  const nopeOpacity = leaving === "pass" ? 1 : Math.min(1, Math.max(0, -drag.x / SWIPE_THRESHOLD));

  return (
    <div className="relative flex h-full w-full select-none flex-col overflow-hidden px-3 pb-2">
      {/* Brand logo header (same LogoHeader used across the app) */}
      <LogoHeader />

      {/* Swipe area */}
      <div className="relative min-h-0 flex-1">
        {/* Card */}
        <div
          ref={cardRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ transform, transition, touchAction: "none" }}
        className="relative h-full w-full cursor-grab overflow-hidden rounded-[28px] bg-neutral-900 shadow-2xl shadow-black/40 active:cursor-grabbing"
      >
        {/* Fallback gradient (shows if the image is missing/broken) */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand/40 via-neutral-800 to-neutral-950" />

        {/* Photo — always fills, never leaves white space */}
        {photo && (
          <img
            src={photo}
            alt={current.name}
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
        )}

        {/* Top bar: brand + FOR YOU / NEARBY toggle + more */}
        <div className="absolute inset-x-3 top-3 z-30 flex items-center gap-2">
          <div className="flex flex-1 items-center rounded-full bg-black/40 p-1 backdrop-blur">
            {(["foryou", "nearby"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setFeedTab(tab)}
                className={`flex-1 rounded-full py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
                  feedTab === tab ? "bg-white text-black" : "text-white/70"
                }`}
              >
                {t(tab === "foryou" ? "discover.forYou" : "discover.nearby")}
              </button>
            ))}
          </div>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setShowFilter(true)}
            aria-label="filters"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur active:bg-black/70"
          >
            <SlidersHorizontal className="h-5 w-5" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setReportFor(current.userId)}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur active:bg-black/70"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>

        {/* Photo progress bars */}
        {current.photos.length > 1 && (
          <div className="absolute inset-x-3 top-14 z-20 flex gap-1.5">
            {current.photos.map((_, i) => (
              <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
                <div className={`h-full rounded-full bg-white ${i === photoIdx ? "w-full" : "w-0"}`} />
              </div>
            ))}
          </div>
        )}

        {/* LIKE / NOPE stamps */}
        <div
          style={{ opacity: likeOpacity }}
          className="absolute left-5 top-24 z-20 -rotate-12 rounded-lg border-4 border-brand px-3 py-1 text-2xl font-extrabold uppercase tracking-wider text-brand"
        >
          LIKE
        </div>
        <div
          style={{ opacity: nopeOpacity }}
          className="absolute right-5 top-24 z-20 rotate-12 rounded-lg border-4 border-white px-3 py-1 text-2xl font-extrabold uppercase tracking-wider text-white"
        >
          NOPE
        </div>

        {/* Info overlay — compact by default (shows a preview), expands on "more" */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black via-black/40 to-transparent px-4 pb-[74px] pt-8">
          <div className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand">
            <Heart className="h-2.5 w-2.5" fill="currentColor" />
            {t(`intent.${current.intent}`)}
          </div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-xl font-extrabold leading-none text-white">{current.name}</h2>
            <span className="text-base font-light text-white/90">{current.age}</span>
            {current.isPremium && <PremiumBadge />}
          </div>

          {/* Core badges — always shown (one row) */}
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className="flex items-center gap-1 rounded-full border border-white/15 bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
              <MapPin className="h-2.5 w-2.5" /> {current.cityLabel}
            </span>
            <span className="rounded-full border border-white/15 bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
              {current.gender === "male"
                ? t("onboarding.gender.male")
                : t("onboarding.gender.female")}
            </span>
            {current.heightCm && (
              <span className="flex items-center gap-1 rounded-full border border-brand/50 bg-brand/30 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                <Ruler className="h-2.5 w-2.5" /> {current.heightCm} cm
              </span>
            )}
          </div>

          {/* Preview (collapsed): first 2 interests + a one-line bio */}
          {!expanded && (
            <>
              {current.interests.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {current.interests.slice(0, 2).map((key) => {
                    const Icon = INTEREST_ICON[key];
                    return (
                      <span
                        key={key}
                        className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur"
                      >
                        {Icon && <Icon className="h-2.5 w-2.5" />} {t(`interest.${key}`)}
                      </span>
                    );
                  })}
                  {current.interests.length > 2 && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur">
                      +{current.interests.length - 2}
                    </span>
                  )}
                </div>
              )}
              {current.bio && (
                <p className="mt-1.5 line-clamp-1 text-[12px] leading-snug text-white/85">
                  {current.bio}
                </p>
              )}
            </>
          )}

          {/* Full details — when expanded */}
          {expanded && (
            <>
              {(current.smoking || current.drinking) && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {current.smoking && (
                    <span className="flex items-center gap-1 rounded-full border border-white/15 bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                      <SmokingIcon className="h-2.5 w-2.5" /> {t(`habit.${current.smoking}`)}
                    </span>
                  )}
                  {current.drinking && (
                    <span className="flex items-center gap-1 rounded-full border border-white/15 bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                      <DrinkingIcon className="h-2.5 w-2.5" /> {t(`habit.${current.drinking}`)}
                    </span>
                  )}
                </div>
              )}

              {current.interests.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {current.interests.map((key) => {
                    const Icon = INTEREST_ICON[key];
                    return (
                      <span
                        key={key}
                        className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur"
                      >
                        {Icon && <Icon className="h-2.5 w-2.5" />} {t(`interest.${key}`)}
                      </span>
                    );
                  })}
                </div>
              )}

              {current.bio && (
                <p className="mt-1.5 text-[12px] leading-snug text-white/85">{current.bio}</p>
              )}
            </>
          )}

          {(current.smoking ||
            current.drinking ||
            current.interests.length > 2 ||
            (current.bio && current.bio.length > 40)) && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setExpanded((v) => !v)}
              className="pointer-events-auto mt-1 text-[11px] font-bold text-brand"
            >
              {expanded ? t("common.less") : t("common.more")}
            </button>
          )}
        </div>
      </div>

      {/* Action bar — rewind · pass pill · gift · like pill */}
      <div className="absolute inset-x-0 bottom-4 z-40 flex items-center gap-2 px-4">
        {/* Rewind (go back) — Premium perk */}
        <button
          type="button"
          aria-label="rewind"
          onClick={doRewind}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={rewinding}
          className="flex h-12 w-12 flex-shrink-0 touch-manipulation items-center justify-center rounded-full bg-white/12 text-amber-300 backdrop-blur transition-transform active:scale-90 disabled:opacity-50"
        >
          <RotateCcw className={`h-5 w-5 ${rewinding ? "animate-spin" : ""}`} />
        </button>

        <button
          type="button"
          aria-label="pass"
          onClick={() => triggerSwipe("pass")}
          onPointerDown={(e) => e.stopPropagation()}
          className="glow-pass flex h-14 flex-1 touch-manipulation items-center justify-center rounded-full bg-white text-black transition-transform active:scale-95"
        >
          <HeartCrack className="h-6 w-6" strokeWidth={2.5} />
        </button>

        {/* Gift / super-like — disabled ("coming soon"), with shine + flip */}
        <button
          type="button"
          disabled
          title={t("discover.gift")}
          className="gift-shine flex h-12 w-12 flex-shrink-0 touch-manipulation items-center justify-center rounded-full bg-neutral-800 text-amber-300 shadow-lg"
        >
          <span className="gift-flip">
            <Gift className="h-5 w-5" />
          </span>
        </button>

        <button
          type="button"
          aria-label="like"
          onClick={() => triggerSwipe("like")}
          onPointerDown={(e) => e.stopPropagation()}
          className="glow-like flex h-14 flex-1 touch-manipulation items-center justify-center rounded-full bg-brand text-black transition-transform active:scale-95"
        >
          <Heart className="h-6 w-6" fill="currentColor" strokeWidth={2} />
        </button>
      </div>
      </div>

      {reportFor && (
        <ReportBlockModal
          targetUserId={reportFor}
          onClose={() => setReportFor(null)}
          onDone={() => {
            setReportFor(null);
            advance();
          }}
        />
      )}

      {showFilter && (
        <FilterModal
          initial={{ minAge, maxAge, scope: feedTab, city: city || undefined }}
          onApply={(f) => {
            setFeedTab(f.scope);
            setMinAge(f.minAge);
            setMaxAge(f.maxAge);
            setCity(f.city ?? "");
            setShowFilter(false);
          }}
          onClose={() => setShowFilter(false)}
        />
      )}

      {limitHit !== null && (
        <LikeLimitModal
          limit={limitHit}
          onUpgrade={() => {
            setLimitHit(null);
            setShowPremium(true);
          }}
          onClose={() => setLimitHit(null)}
        />
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

