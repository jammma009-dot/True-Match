import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Heart, HeartCrack, Gift, MapPin, Sparkles, RefreshCw, MoreVertical } from "lucide-react";
import { api, PublicProfile, MatchListItem } from "../lib/api";
import { useT } from "../store/useStore";
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
  const [feedTab, setFeedTab] = useState<"foryou" | "nearby">("foryou");
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["discovery", feedTab],
    queryFn: () => api.getDiscovery(feedTab),
  });

  const [queue, setQueue] = useState<PublicProfile[]>([]);
  const [index, setIndex] = useState(0);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [reportFor, setReportFor] = useState<string | null>(null);

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

    // Fire the network call during the fly-off animation.
    api
      .swipe(current.userId, action)
      .then((res) => {
        if (res.matched && res.matchId) {
          haptics.notify("success");
          onMatch({
            matchId: res.matchId,
            createdAt: new Date().toISOString(),
            user: {
              userId: current.userId,
              name: current.name,
              age: current.age,
              city: current.city,
              cityLabel: current.cityLabel,
              photo: current.photos[0]?.url ?? null,
            },
            lastMessage: null,
          });
        }
      })
      .catch(() => undefined);

    window.setTimeout(() => {
      advance();
      setLeaving(null);
      setDrag({ x: 0, y: 0, active: false });
      busyRef.current = false;
    }, 300);
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
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--tg-secondary-bg-color)]">
          <Sparkles className="h-9 w-9 text-brand" />
        </div>
        <p className="mb-6 max-w-xs text-tg-hint">{t("discover.empty")}</p>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 rounded-full bg-[var(--tg-secondary-bg-color)] px-5 py-2.5 font-medium text-tg active:opacity-70"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          {t("common.retry")}
        </button>
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
    <div className="relative flex h-full w-full select-none flex-col overflow-hidden px-3 pb-3 pt-2">
      {/* Brand logo header — solid wordmark (black bg blends into the app) */}
      <div className="flex flex-shrink-0 items-center justify-center pb-1 pt-0.5">
        <img
          src="/logo-wordmark.png"
          alt="True Match"
          draggable={false}
          className="h-10 w-auto object-contain"
        />
      </div>

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

        {/* Info overlay — sits above the action bar */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black via-black/60 to-transparent px-5 pb-32 pt-24">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-brand">
            <Heart className="h-3.5 w-3.5" fill="currentColor" />
            {t(`intent.${current.intent}`)}
          </div>
          <div className="flex items-end gap-2">
            <h2 className="text-4xl font-extrabold leading-none text-white">{current.name}</h2>
            <span className="text-3xl font-light text-white/90">{current.age}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="flex items-center gap-1 rounded-full border border-white/15 bg-white/25 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
              <MapPin className="h-3.5 w-3.5" /> {current.cityLabel}
            </span>
            <span className="rounded-full border border-white/15 bg-white/25 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
              {current.gender === "male"
                ? t("onboarding.gender.male")
                : t("onboarding.gender.female")}
            </span>
          </div>
        </div>
      </div>

      {/* Action bar — white pill (pass) · dark circle (gift) · pink pill (like) */}
      <div className="absolute inset-x-0 bottom-6 z-40 flex items-center gap-3 px-5">
        <button
          type="button"
          aria-label="pass"
          onClick={() => triggerSwipe("pass")}
          onPointerDown={(e) => e.stopPropagation()}
          className="glow-pass flex h-16 flex-1 touch-manipulation items-center justify-center rounded-full bg-white text-black transition-transform active:scale-95"
        >
          <HeartCrack className="h-7 w-7" strokeWidth={2.5} />
        </button>

        {/* Gift / super-like — disabled ("coming soon") */}
        <button
          type="button"
          disabled
          title={t("discover.gift")}
          className="flex h-14 w-14 flex-shrink-0 touch-manipulation items-center justify-center rounded-full bg-neutral-800 text-white/70 shadow-lg"
        >
          <Gift className="h-5 w-5" />
        </button>

        <button
          type="button"
          aria-label="like"
          onClick={() => triggerSwipe("like")}
          onPointerDown={(e) => e.stopPropagation()}
          className="glow-like flex h-16 flex-1 touch-manipulation items-center justify-center rounded-full bg-brand text-black transition-transform active:scale-95"
        >
          <Heart className="h-7 w-7" fill="currentColor" strokeWidth={2} />
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
    </div>
  );
}

