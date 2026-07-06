import { useQuery } from "@tanstack/react-query";
import { MessagesSquare, ChevronRight } from "lucide-react";
import { api, MatchListItem } from "../lib/api";
import { useT } from "../store/useStore";
import { Spinner } from "../components/ui";
import { haptics } from "../lib/telegram";
import { LogoHeader } from "../components/LogoHeader";

export function MatchesScreen({
  onOpenChat,
}: {
  onOpenChat: (match: MatchListItem) => void;
}) {
  const t = useT();
  const { data, isLoading } = useQuery({
    queryKey: ["matches"],
    queryFn: api.getMatches,
    refetchInterval: 15_000,
  });

  if (isLoading) return <Spinner />;

  const matches = data?.matches ?? [];

  return (
    <div className="min-h-full px-4 pb-4">
      <LogoHeader />
      <h1 className="mb-4 text-2xl font-bold text-tg">{t("matches.title")}</h1>
      {matches.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-8 pt-24 text-center text-tg-hint">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--tg-secondary-bg-color)]">
            <MessagesSquare className="h-9 w-9 text-brand" />
          </div>
          <p className="max-w-xs">{t("matches.empty")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {matches.map((m) => (
            <button
              key={m.matchId}
              onClick={() => {
                haptics.select();
                onOpenChat(m);
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-[var(--tg-secondary-bg-color)] p-3 text-left"
            >
              <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-black/20">
                {m.user?.photo ? (
                  <img src={m.user.photo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl">👤</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-tg">
                    {m.user?.name ?? "—"}
                  </span>
                  {m.user && <span className="text-sm text-tg-hint">{m.user.age}</span>}
                </div>
                <p className={`truncate text-sm ${m.lastMessage ? "text-tg-hint" : "font-medium text-brand"}`}>
                  {m.lastMessage ? m.lastMessage.body : t("matches.newMatchLabel")}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 flex-shrink-0 text-tg-hint" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
