import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, PublicProfile } from "../lib/api";
import { useT } from "../store/useStore";
import { Spinner } from "../components/ui";
import { haptics } from "../lib/telegram";
import { ReportBlockModal } from "../components/ReportBlockModal";

export function DiscoverScreen() {
  const t = useT();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["discovery"],
    queryFn: api.getDiscovery,
  });

  const [index, setIndex] = useState(0);
  const [queue, setQueue] = useState<PublicProfile[]>([]);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [matchName, setMatchName] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    if (index + 1 >= queue.length) {
      // Reached end — refetch a fresh queue.
      refetch();
    } else {
      setIndex((i) => i + 1);
    }
  };

  const doSwipe = async (action: "like" | "pass") => {
    if (!current || busy) return;
    setBusy(true);
    haptics.impact(action === "like" ? "medium" : "light");
    try {
      const res = await api.swipe(current.userId, action);
      if (res.matched) {
        haptics.notify("success");
        setMatchName(current.name);
      }
    } catch {
      /* ignore, still advance */
    } finally {
      setBusy(false);
      advance();
    }
  };

  if (isLoading) return <Spinner />;

  if (!current) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-8 text-center text-tg-hint">
        <div className="mb-4 text-5xl">🌆</div>
        <p>{t("discover.empty")}</p>
      </div>
    );
  }

  const photo = current.photos[photoIdx]?.url ?? current.photos[0]?.url;

  return (
    <div className="flex min-h-full flex-col p-4">
      {/* Card */}
      <div className="relative flex-1 overflow-hidden rounded-3xl bg-[var(--tg-secondary-bg-color)]">
        {photo ? (
          <img src={photo} alt={current.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-6xl">👤</div>
        )}

        {/* Photo tap zones to cycle photos */}
        {current.photos.length > 1 && (
          <>
            <button
              className="absolute left-0 top-0 h-full w-1/3"
              onClick={() =>
                setPhotoIdx((p) => (p - 1 + current.photos.length) % current.photos.length)
              }
            />
            <button
              className="absolute right-0 top-0 h-full w-1/3"
              onClick={() => setPhotoIdx((p) => (p + 1) % current.photos.length)}
            />
            <div className="absolute left-0 right-0 top-2 flex gap-1 px-3">
              {current.photos.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full ${i === photoIdx ? "bg-white" : "bg-white/30"}`}
                />
              ))}
            </div>
          </>
        )}

        {/* Report/block */}
        <button
          onClick={() => setReportFor(current.userId)}
          className="absolute right-3 top-6 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white"
        >
          ⋮
        </button>

        {/* Info overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 to-transparent p-5 pt-16">
          <div className="flex items-end gap-2">
            <h2 className="text-2xl font-bold text-white">{current.name}</h2>
            <span className="pb-0.5 text-xl text-white/90">{current.age}</span>
          </div>
          <p className="mt-1 text-sm text-white/80">📍 {current.cityLabel}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs text-white backdrop-blur">
              {t(`intent.${current.intent}`)}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-6 py-5">
        <button
          onClick={() => doSwipe("pass")}
          disabled={busy}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--tg-secondary-bg-color)] text-3xl text-pass shadow-lg active:scale-95 disabled:opacity-50"
        >
          ✕
        </button>
        {/* Gift / super-like placeholder — disabled ("coming soon") */}
        <button
          disabled
          title={t("discover.gift")}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--tg-secondary-bg-color)] text-2xl opacity-40"
        >
          🎁
        </button>
        <button
          onClick={() => doSwipe("like")}
          disabled={busy}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-like text-3xl text-white shadow-lg active:scale-95 disabled:opacity-50"
        >
          ❤️
        </button>
      </div>

      {/* Match celebration */}
      {matchName && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 px-8 text-center"
          onClick={() => setMatchName(null)}
        >
          <div className="mb-4 text-6xl">🎉</div>
          <h2 className="mb-2 text-3xl font-bold text-white">{t("discover.newMatch")}</h2>
          <p className="text-white/80">{matchName}</p>
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
