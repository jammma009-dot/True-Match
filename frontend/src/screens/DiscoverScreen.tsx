import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Heart, Gift, MapPin, Sparkles, RefreshCw } from "lucide-react";
import { api, PublicProfile } from "../lib/api";
import { useT } from "../store/useStore";
import { haptics } from "../lib/telegram";
import { ReportBlockModal } from "../components/ReportBlockModal";

const SWIPE_THRESHOLD = 90; // px of horizontal drag to count as a swipe
const TAP_SLOP = 10; // px of movement below which we treat it as a tap

export function DiscoverScreen() {
  const t = useT();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["discovery"],
    queryFn: api.getDiscovery,
  });

  const [queue, setQueue] = useState<PublicProfile[]>([]);
  const [index, setIndex] = useState(0);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [matchName, setMatchName] = useState<string | null>(null);
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
        if (res.matched) {
          haptics.notify("success");
          setMatchName(current.name);
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
    <div className="relative h-full w-full select-none overflow-hidden px-3 pb-3 pt-3">
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

        {/* Photo progress bars */}
        {current.photos.length > 1 && (
          <div className="absolute inset-x-3 top-3 z-20 flex gap-1.5">
            {current.photos.map((_, i) => (
              <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
                <div className={`h-full rounded-full bg-white ${i === photoIdx ? "w-full" : "w-0"}`} />
              </div>
            ))}
          </div>
        )}

        {/* LIKE / NOPE stamps */}
        <div
          style={{ opacity: likeOpacity }}
          className="absolute left-5 top-16 z-20 -rotate-12 rounded-lg border-4 border-like px-3 py-1 text-2xl font-extrabold uppercase tracking-wider text-like"
        >
          LIKE
        </div>
        <div
          style={{ opacity: nopeOpacity }}
          className="absolute right-5 top-16 z-20 rotate-12 rounded-lg border-4 border-pass px-3 py-1 text-2xl font-extrabold uppercase tracking-wider text-pass"
        >
          NOPE
        </div>

        {/* Report/block */}
        <button
          type="button"
          onClick={() => setReportFor(current.userId)}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute right-3 top-8 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur active:bg-black/60"
        >
          <span className="text-lg leading-none">⋮</span>
        </button>

        {/* Info overlay — sits above the action buttons */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-5 pb-28 pt-20">
          <div className="flex items-end gap-2">
            <h2 className="text-3xl font-bold text-white drop-shadow">{current.name}</h2>
            <span className="pb-1 text-2xl font-light text-white/90">{current.age}</span>
          </div>
          <p className="mt-1 flex items-center gap-1 text-sm text-white/80">
            <MapPin className="h-4 w-4" /> {current.cityLabel}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
              {t(`intent.${current.intent}`)}
            </span>
          </div>
        </div>
      </div>

      {/* Action buttons — overlaid on the card, always visible, no scrolling */}
      <div className="absolute inset-x-0 bottom-7 z-40 flex items-center justify-center gap-5">
        <ActionButton onClick={() => triggerSwipe("pass")} variant="pass" label="pass">
          <X className="h-7 w-7" strokeWidth={3} />
        </ActionButton>

        {/* Gift / super-like — disabled ("coming soon") */}
        <button
          type="button"
          disabled
          title={t("discover.gift")}
          className="flex h-12 w-12 touch-manipulation items-center justify-center rounded-full bg-white/90 text-amber-400 opacity-50 shadow-lg"
        >
          <Gift className="h-5 w-5" />
        </button>

        <ActionButton onClick={() => triggerSwipe("like")} variant="like" label="like">
          <Heart className="h-7 w-7" strokeWidth={2.5} fill="currentColor" />
        </ActionButton>
      </div>

      {/* Match celebration */}
      {matchName && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 px-8 text-center backdrop-blur-sm"
          onClick={() => setMatchName(null)}
        >
          <Sparkles className="mb-4 h-14 w-14 text-brand" />
          <h2 className="mb-2 bg-gradient-to-r from-brand to-pink-400 bg-clip-text text-4xl font-extrabold text-transparent">
            {t("discover.newMatch")}
          </h2>
          <p className="text-lg text-white/80">{matchName}</p>
          <p className="mt-6 text-sm text-white/50">Tap to continue</p>
        </div>
      )}

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

function ActionButton({
  children,
  onClick,
  variant,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant: "like" | "pass";
  label: string;
}) {
  const styles =
    variant === "like"
      ? "bg-gradient-to-br from-emerald-400 to-like text-white"
      : "bg-white text-pass";
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className={`flex h-16 w-16 touch-manipulation items-center justify-center rounded-full shadow-xl shadow-black/30 transition-transform active:scale-90 ${styles}`}
    >
      {children}
    </button>
  );
}
