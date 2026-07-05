import { useQuery } from "@tanstack/react-query";
import { api, MatchListItem } from "../lib/api";
import { useT } from "../store/useStore";
import { Spinner } from "../components/ui";
import { haptics } from "../lib/telegram";

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
    <div className="min-h-full px-4 pt-4">
      <h1 className="mb-4 text-2xl font-bold text-tg">{t("matches.title")}</h1>
      {matches.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-8 pt-24 text-center text-tg-hint">
          <div className="mb-4 text-5xl">💫</div>
          <p>{t("matches.empty")}</p>
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
                <p className="truncate text-sm text-tg-hint">
                  {m.lastMessage ? m.lastMessage.body : t("matches.newMatchLabel")}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
