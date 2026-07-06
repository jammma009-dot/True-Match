import { Sparkles, MessageCircle } from "lucide-react";
import { MatchListItem } from "../lib/api";
import { useT } from "../store/useStore";

/**
 * "It's a match!" celebration overlay. Stays until the user picks an action.
 * Shown both to the person who swiped last (via the swipe response) and to the
 * other person in real time (via the `match:new` socket event).
 */
export function MatchModal({
  match,
  onSendMessage,
  onKeepSwiping,
}: {
  match: MatchListItem;
  onSendMessage: () => void;
  onKeepSwiping: () => void;
}) {
  const t = useT();
  const u = match.user;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 px-8 text-center backdrop-blur-md">
      <Sparkles className="mb-3 h-12 w-12 animate-pulse text-brand" />
      <h2 className="mb-6 bg-gradient-to-r from-brand via-fuchsia-400 to-pink-400 bg-clip-text text-4xl font-extrabold text-transparent">
        {t("discover.newMatch")}
      </h2>

      <div className="mb-4 h-40 w-40 overflow-hidden rounded-full border-4 border-brand/60 shadow-2xl shadow-brand/30">
        {u?.photo ? (
          <img src={u.photo} alt={u.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-800 text-5xl">
            👤
          </div>
        )}
      </div>
      {u && <p className="mb-8 text-lg text-white/90">{u.name}, {u.age}</p>}

      <div className="w-full max-w-xs space-y-3">
        {match.matchId && (
          <button
            type="button"
            onClick={onSendMessage}
            className="flex w-full touch-manipulation items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand to-brand-dark py-3.5 font-semibold text-white shadow-lg shadow-brand/25 active:scale-[0.98]"
          >
            <MessageCircle className="h-5 w-5" />
            {t("discover.sendMessage")}
          </button>
        )}
        <button
          type="button"
          onClick={onKeepSwiping}
          className="w-full touch-manipulation rounded-2xl bg-white/10 py-3.5 font-semibold text-white active:scale-[0.98]"
        >
          {t("discover.keepSwiping")}
        </button>
      </div>
    </div>
  );
}
