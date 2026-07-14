import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, HeartCrack, Gift, MapPin, Sparkles, RefreshCw, MoreVertical, Ruler, SlidersHorizontal, RotateCcw, GraduationCap, Briefcase } from "lucide-react";
import { api, ApiError, PublicProfile, MatchListItem } from "../lib/api";
import { useStore, useT } from "../store/useStore";
import { INTEREST_ICON, SmokingIcon, DrinkingIcon } from "../lib/profileMeta";
import { LogoHeader } from "../components/LogoHeader";
import { FilterModal } from "../components/FilterModal";
import { PremiumBadge } from "../components/PremiumBadge";
import { VerifiedBadge } from "../components/VerifiedBadge";
import { PremiumModal } from "../components/PremiumModal";
import { PresentModal } from "../components/PresentModal";
import { LikeLimitModal } from "../components/LikeLimitModal";
import { RewindPromptModal } from "../components/RewindPromptModal";
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
  const priceStars = me?.settings?.premiumPlans?.[0]?.priceStars ?? 250;
  const [showPremium, setShowPremium] = useState(false);
  const [limitHit, setLimitHit] = useState<number | null>(null);
  const [rewinding, setRewinding] = useState(false);
  const [showRewindPrompt, setShowRewindPrompt] = useState(false);
  const [giftTarget, setGiftTarget] = useState<PublicProfile | null>(null);
  const presentPrice = me?.settings?.presentPriceStars ?? 100;
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

  // Drag / animation state. During a drag we update the DOM imperatively (via
  // refs) so we DON'T re-render React on every pointermove — that's what made
  // swiping feel laggy. React state only changes on start/end + fly-off.
  const [dragActive, setDragActive] = useState(false);
  const [leaving, setLeaving] = useState<null | "like" | "pass">(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const likeStampRef = useRef<HTMLDivElement>(null);
  const nopeStampRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  const resetStamps = () => {
    if (likeStampRef.current) likeStampRef.current.style.opacity = "0";
    if (nopeStampRef.current) nopeStampRef.current.style.opacity = "0";
  };

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
    resetStamps();
    setDragActive(false);
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
      busyRef.current = false;
    }, 300);
  };

  // Rewind the last swipe (Premium only).
  const doRewind = async () => {
    if (rewinding || busyRef.current || leaving) return;
    if (!isPremium) {
      haptics.notify("warning");
      setShowRewindPrompt(true);
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
    setDragActive(true);
    const card = cardRef.current;
    if (card) card.style.transition = "none";
    card?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    // Imperative — no React re-render, so dragging stays buttery smooth.
    const card = cardRef.current;
    if (card) {
      card.style.transform = `translate3d(${dx}px, ${dy * 0.12}px, 0) rotate(${dx / 22}deg)`;
    }
    if (likeStampRef.current) {
      likeStampRef.current.style.opacity = String(Math.min(1, Math.max(0, dx / SWIPE_THRESHOLD)));
    }
    if (nopeStampRef.current) {
      nopeStampRef.current.style.opacity = String(Math.min(1, Math.max(0, -dx / SWIPE_THRESHOLD)));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!startRef.current || !current) {
      setDragActive(false);
      return;
    }
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    const dist = Math.hypot(dx, dy);
    startRef.current = null;
    resetStamps();

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
      setDragActive(false);
      return;
    }

    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      triggerSwipe(dx > 0 ? "like" : "pass");
    } else {
      // Snap back — React re-render restores transform to identity with a
      // transition, animating the card home.
      setDragActive(false);
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

  // Card transform is React-controlled only when NOT actively dragging (fly-off
  // or snap-back). During a drag the transform is set imperatively in onPointerMove.
  const transform = leaving
    ? `translateX(${leaving === "like" ? 130 : -130}%) rotate(${leaving === "like" ? 18 : -18}deg)`
    : "none";
  const transition = dragActive
    ? "none"
    : "transform 0.32s cubic-bezier(0.22,1,0.36,1)";

  const likeOpacity = leaving === "like" ? 1 : 0;
  const nopeOpacity = leaving === "pass" ? 1 : 0;

  return (
    <div className="relative flex h-full w-full select-none flex-col overflow-hidden px-2 pb-1">
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
          style={{ transform, transition, touchAction: "none", willChange: leaving ? "transform" : "auto" }}
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

          {/* LIKE / NOPE stamps (opacity updated imperatively while dragging) */}
          <div
            ref={likeStampRef}
            style={{ opacity: likeOpacity }}
            className="pointer-events-none absolute left-5 top-24 z-20 -rotate-12 rounded-lg border-4 border-brand px-3 py-1 text-2xl font-extrabold uppercase tracking-wider text-brand"
          >
            LIKE
          </div>
          <div
            ref={nopeStampRef}
            style={{ opacity: nopeOpacity }}
            className="pointer-events-none absolute right-5 top-24 z-20 rotate-12 rounded-lg border-4 border-white px-3 py-1 text-2xl font-extrabold uppercase tracking-wider text-white"
          >
            NOPE
          </div>

          {/* Info overlay — compact by default (shows a preview), expands on "more" */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black via-black/40 to-transparent px-4 pb-[96px] pt-8">
            <div className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-brand">
              <Heart className="h-3 w-3" fill="currentColor" />
              {t(`intent.${current.intent}`)}
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-extrabold leading-none text-white">{current.name}</h2>
              <span className="text-lg font-light text-white/90">{current.age}</span>
              {current.isPremium && <PremiumBadge />}
              {current.verified && <VerifiedBadge />}
            </div>

            {/* Core badges — always shown (one row). backdrop-blur removed: these
                re-mount every swipe and blur-on-mount triggers the iOS Safari
                black-flash bug. */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="flex items-center gap-1 rounded-full border border-white/15 bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white">
                <MapPin className="h-3 w-3" /> {t(`city.${current.city}`)}
              </span>
              <span className="rounded-full border border-white/15 bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white">
                {current.gender === "male"
                  ? t("onboarding.gender.male")
                  : t("onboarding.gender.female")}
              </span>
              {current.heightCm && (
                <span className="flex items-center gap-1 rounded-full border border-brand/50 bg-brand/30 px-2.5 py-1 text-[11px] font-semibold text-white">
                  <Ruler className="h-3 w-3" /> {current.heightCm} cm
                </span>
              )}
            </div>

            {/* Work / Study — shown when toggled on; place text is optional. */}
            {(current.works || current.studies) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {current.works && (
                  <span className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/25 px-2 py-0.5 text-[11px] font-semibold text-amber-100">
                    <Briefcase className="h-3 w-3" /> {t("profile.workLabel")}
                    {current.work ? `: ${current.work}` : ""}
                  </span>
                )}
                {current.studies && (
                  <span className="flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-400/25 px-2 py-0.5 text-[11px] font-semibold text-sky-100">
                    <GraduationCap className="h-3 w-3" /> {t("profile.studyLabel")}
                    {current.education ? `: ${current.education}` : ""}
                  </span>
                )}
              </div>
            )}

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
                          className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white"
                        >
                          {Icon && <Icon className="h-3 w-3" />} {t(`interest.${key}`)}
                        </span>
                      );
                    })}
                    {current.interests.length > 2 && (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/80">
                        +{current.interests.length - 2}
                      </span>
                    )}
                  </div>
                )}
                {current.bio && (
                  <p className="mt-1.5 line-clamp-1 text-[13px] leading-snug text-white/85">
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
                      <span className="flex items-center gap-1 rounded-full border border-white/15 bg-white/20 px-2 py-0.5 text-[11px] font-semibold text-white">
                        <SmokingIcon className="h-3 w-3" /> {t(`habit.${current.smoking}`)}
                      </span>
                    )}
                    {current.drinking && (
                      <span className="flex items-center gap-1 rounded-full border border-white/15 bg-white/20 px-2 py-0.5 text-[11px] font-semibold text-white">
                        <DrinkingIcon className="h-3 w-3" /> {t(`habit.${current.drinking}`)}
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
                          className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white"
                        >
                          {Icon && <Icon className="h-3 w-3" />} {t(`interest.${key}`)}
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

          {/* Rewind (go back) — Premium perk. Floating on the left, up high so it
              sits over the photo and never covers the info text at the bottom. */}
          <button
            type="button"
            aria-label="rewind"
            onClick={doRewind}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={rewinding}
            className="absolute left-2 top-1/2 z-40 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-amber-300 shadow-lg backdrop-blur active:scale-90 disabled:opacity-50"
          >
            <RotateCcw className={`h-5 w-5 ${rewinding ? "animate-spin" : ""}`} />
          </button>

          {/* Action bar — white pill (pass) · dark circle (gift) · pink pill (like) */}
          <div className="absolute inset-x-0 bottom-4 z-40 flex items-center gap-2.5 px-5">
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
              aria-label="present"
              title={t("discover.gift")}
              onClick={() => {
                if (!current) return;
                haptics.impact("light");
                setGiftTarget(current);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="gift-shine flex h-12 w-12 flex-shrink-0 touch-manipulation items-center justify-center rounded-full bg-neutral-800 text-amber-300 shadow-lg active:scale-90"
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

      {giftTarget && (
        <PresentModal
          targetUserId={giftTarget.userId}
          targetName={giftTarget.name}
          isGift
          priceStars={presentPrice}
          paymentUsername={paymentUsername}
          onPaid={() => {
            setGiftTarget(null);
            advance();
            queryClient.invalidateQueries({ queryKey: ["matches"] });
          }}
          onClose={() => setGiftTarget(null)}
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

      {showRewindPrompt && (
        <RewindPromptModal
          onUpgrade={() => {
            setShowRewindPrompt(false);
            setShowPremium(true);
          }}
          onClose={() => setShowRewindPrompt(false)}
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
