import { Heart } from "lucide-react";
import { useT } from "../store/useStore";

/**
 * "Likes" tab — placeholder for the MVP. Seeing who liked you is a premium
 * feature that will plug in later alongside Telegram Stars.
 */
export function LikesScreen() {
  const t = useT();
  return (
    <div className="min-h-full px-4 pt-5">
      <h1 className="mb-4 text-2xl font-bold text-tg">{t("likes.title")}</h1>
      <div className="flex flex-col items-center justify-center px-8 pt-24 text-center text-tg-hint">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-pink-500/20 to-brand/10">
          <Heart className="h-9 w-9 text-pink-400" fill="currentColor" />
        </div>
        <p className="max-w-xs">{t("likes.comingSoon")}</p>
      </div>
    </div>
  );
}
