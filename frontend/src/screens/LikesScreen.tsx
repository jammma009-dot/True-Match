import { useT } from "../store/useStore";

/**
 * "Likes" tab — placeholder for the MVP. Seeing who liked you is a premium
 * feature that will plug in later alongside Telegram Stars.
 */
export function LikesScreen() {
  const t = useT();
  return (
    <div className="min-h-full px-4 pt-4">
      <h1 className="mb-4 text-2xl font-bold text-tg">{t("likes.title")}</h1>
      <div className="flex flex-col items-center justify-center px-8 pt-24 text-center text-tg-hint">
        <div className="mb-4 text-5xl">❤️</div>
        <p>{t("likes.comingSoon")}</p>
      </div>
    </div>
  );
}
