import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreVertical, Send, ChevronLeft, ExternalLink } from "lucide-react";
import { api, ChatMessage, MatchListItem } from "../lib/api";
import { useStore, useT } from "../store/useStore";
import { getSocket } from "../lib/socket";
import { showBackButton, hideBackButton, haptics, openTelegramLink } from "../lib/telegram";
import { Spinner } from "../components/ui";
import { ReportBlockModal } from "../components/ReportBlockModal";
import { MatchProfileView } from "../components/MatchProfileView";
import { PremiumBadge } from "../components/PremiumBadge";

export function ChatScreen({
  match,
  onBack,
}: {
  match: MatchListItem;
  onBack: () => void;
}) {
  const t = useT();
  const myUserId = useStore((s) => s.me?.user.id);
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["messages", match.matchId],
    queryFn: () => api.getMessages(match.matchId),
  });

  useEffect(() => {
    if (data?.messages) {
      setMessages(data.messages);
      // Loading the chat marks messages read server-side → refresh the badge.
      queryClient.invalidateQueries({ queryKey: ["matches"] });
    }
  }, [data, queryClient]);

  // Telegram back button: closes the profile view if open, else returns to the
  // matches list.
  useEffect(() => {
    if (showProfile) showBackButton(() => setShowProfile(false));
    else showBackButton(onBack);
    return () => hideBackButton();
  }, [onBack, showProfile]);

  // Socket: tell the server this chat is open (so it won't send a redundant
  // Telegram notification) and listen for incoming messages.
  useEffect(() => {
    const socket = getSocket();
    socket.emit("chat:open", { matchId: match.matchId });
    // Opening the chat clears both the unread messages and the "new match" flag.
    void api.markMatchSeen(match.matchId).catch(() => undefined);

    const onNew = (msg: ChatMessage) => {
      if (msg.matchId === match.matchId) {
        setMessages((prev) =>
          prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
        );
        // We're viewing this chat → mark read so the badge doesn't count it.
        void api.markRead(match.matchId).catch(() => undefined);
      }
      queryClient.invalidateQueries({ queryKey: ["matches"] });
    };
    socket.on("message:new", onNew);

    return () => {
      socket.emit("chat:close", { matchId: match.matchId });
      socket.off("message:new", onNew);
    };
  }, [match.matchId, queryClient]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    haptics.impact("light");
    const socket = getSocket();
    socket.emit(
      "message:send",
      { matchId: match.matchId, body },
      (res: { ok: boolean; message?: ChatMessage }) => {
        if (res?.ok && res.message) {
          setMessages((prev) =>
            prev.some((m) => m.id === res.message!.id)
              ? prev
              : [...prev, res.message!],
          );
        }
      },
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/5 bg-[var(--tg-secondary-bg-color)] px-3 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="back"
          className="flex h-9 w-9 flex-shrink-0 touch-manipulation items-center justify-center rounded-full text-tg active:bg-white/10"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={() => {
            haptics.impact("light");
            setShowProfile(true);
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left active:opacity-70"
        >
          <div
            className={`h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-black/20 ${
              match.user?.isPremium ? "ring-2 ring-amber-400" : ""
            }`}
          >
            {match.user?.photo ? (
              <img src={match.user.photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">👤</div>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate font-semibold text-tg">{match.user?.name ?? "—"}</p>
            {match.user?.isPremium && <PremiumBadge />}
          </div>
        </button>
        {/* Premium perk: jump straight to their Telegram (username revealed only
            to Premium users by the backend). */}
        {match.user?.telegramUsername && (
          <button
            type="button"
            onClick={() => {
              haptics.impact("light");
              openTelegramLink(`https://t.me/${match.user!.telegramUsername}`);
            }}
            aria-label="open telegram"
            className="flex h-9 items-center gap-1 rounded-full bg-amber-400/20 px-3 text-amber-300 active:opacity-70"
          >
            <ExternalLink className="h-4 w-4" />
            <span className="text-xs font-semibold">{t("chat.openTelegram")}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowReport(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/20 text-tg active:bg-black/30"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {isLoading ? (
          <Spinner />
        ) : (
          messages.map((m) => {
            const mine = m.senderId === myUserId;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 text-[15px] ${
                    mine
                      ? "rounded-br-md bg-brand text-white"
                      : "rounded-bl-md bg-[var(--tg-secondary-bg-color)] text-tg"
                  }`}
                >
                  {m.body}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <div className="flex items-center gap-2 border-t border-white/5 bg-[var(--tg-secondary-bg-color)] p-3">
        <input
          className="flex-1 rounded-full bg-[var(--tg-bg-color)] px-4 py-2.5 text-tg outline-none placeholder:text-tg-hint"
          placeholder={t("chat.placeholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim()}
          className="flex h-11 w-11 flex-shrink-0 touch-manipulation items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-dark text-white transition-transform active:scale-90 disabled:opacity-40"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>

      {showReport && match.user && (
        <ReportBlockModal
          targetUserId={match.user.userId}
          onClose={() => setShowReport(false)}
          onDone={onBack}
        />
      )}

      {showProfile && (
        <MatchProfileView
          matchId={match.matchId}
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
  );
}
