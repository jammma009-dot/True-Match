import { useQuery } from "@tanstack/react-query";
import { Heart, MapPin } from "lucide-react";
import { api } from "../lib/api";
import { useT } from "../store/useStore";
import { LogoHeader } from "../components/LogoHeader";
import { Spinner } from "../components/ui";

/**
 * Likes tab — people who liked the current user. Photos are blurred (a tease);
 * to reveal them, the user finds & likes them back in discovery, which turns
 * them into a match and removes them from this list.
 */
export function LikesScreen() {
  const t = useT();
  const { data, isLoading } = useQuery({
    queryKey: ["likes"],
    queryFn: api.getLikes,
  });
  const likes = data?.likes ?? [];

  return (
    <div className="min-h-full px-4 pb-6">
      <LogoHeader />
      <h1 className="text-xl font-bold text-tg">{t("likes.title")}</h1>
      <p className="mb-4 text-sm text-tg-hint">{t("likes.subtitle")}</p>

      {isLoading ? (
        <Spinner />
      ) : likes.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-8 pt-20 text-center text-tg-hint">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-pink-500/20 to-brand/10">
            <Heart className="h-9 w-9 text-pink-400" fill="currentColor" />
          </div>
          <p className="max-w-xs">{t("likes.empty")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {likes.map((p) => (
            <div
              key={p.userId}
              className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-[var(--tg-secondary-bg-color)]"
            >
              {p.photos[0] ? (
                <img
                  src={p.photos[0].url}
                  alt=""
                  className="h-full w-full scale-110 object-cover blur-xl"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-4xl">
                  👤
                </div>
              )}
              {/* Heart overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 backdrop-blur">
                  <Heart className="h-6 w-6 text-brand" fill="currentColor" />
                </div>
              </div>
              {/* Info */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3">
                <p className="text-sm font-bold text-white">
                  {p.name}, {p.age}
                </p>
                <p className="flex items-center gap-1 text-xs text-white/75">
                  <MapPin className="h-3 w-3" /> {p.cityLabel}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
