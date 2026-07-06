import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreVertical, Send, ChevronLeft } from "lucide-react";
import { api, ChatMessage, MatchListItem } from "../lib/api";
import { useStore, useT } from "../store/useStore";
import { getSocket } from "../lib/socket";
import { showBackButton, hideBackButton, haptics } from "../lib/telegram";
import { Spinner } from "../components/ui";
import { ReportBlockModal } from "../components/ReportBlockModal";

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
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["messages", match.matchId],
    queryFn: () => api.getMessages(match.matchId),
  });

  useEffect(() => {
    if (data?.messages) setMessages(data.messages);
  }, [data]);

  // Telegram back button returns to the matches list.
  useEffect(() => {
    showBackButton(onBack);
    return () => hideBackButton();
  }, [onBack]);

  // Socket: listen for incoming messages for this match.
  useEffect(() => {
    const socket = getSocket();
    const onNew = (msg: ChatMessage) => {
      if (msg.matchId === match.matchId) {
        setMessages((prev) =>
          prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
        );
      }
      // Keep the matches list preview fresh.
      queryClient.invalidateQueries({ queryKey: ["matches"] });
    };
    socket.on("message:new", onNew);
    return () => {
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
        <div className="h-10 w-10 overflow-hidden rounded-full bg-black/20">
          {match.user?.photo ? (
            <img src={match.user.photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">👤</div>
          )}
        </div>
        <div className="flex-1">
          <p className="font-semibold text-tg">{match.user?.name ?? "—"}</p>
        </div>
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
    </div>
  );
}
