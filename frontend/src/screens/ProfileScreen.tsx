import { useStore, useT } from "../store/useStore";
import { api } from "../lib/api";
import { Locale } from "../i18n";
import { haptics } from "../lib/telegram";

export function ProfileScreen() {
  const t = useT();
  const me = useStore((s) => s.me);
  const setLanguage = useStore((s) => s.setLanguage);
  const profile = me?.profile;

  const changeLanguage = async (lang: Locale) => {
    haptics.select();
    setLanguage(lang);
    try {
      await api.setLanguage(lang);
    } catch {
      /* ignore */
    }
  };

  const statusColor =
    profile?.status === "approved"
      ? "text-like"
      : profile?.status === "rejected"
        ? "text-pass"
        : "text-tg-hint";

  return (
    <div className="min-h-full px-4 pt-4">
      <h1 className="mb-4 text-2xl font-bold text-tg">{t("profile.title")}</h1>

      {profile && (
        <>
          {profile.photos[0] && (
            <div className="mb-4 aspect-square w-full overflow-hidden rounded-3xl bg-[var(--tg-secondary-bg-color)]">
              <img
                src={profile.photos[0].url}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <div className="mb-4 rounded-2xl bg-[var(--tg-secondary-bg-color)] p-4">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-tg">{profile.name}</span>
              <span className="text-tg-hint">{profile.age}</span>
            </div>
            <p className="mt-1 text-sm text-tg-hint">📍 {profile.cityLabel}</p>
            <p className="mt-1 text-sm text-tg-hint">{t(`intent.${profile.intent}`)}</p>
            <p className={`mt-2 text-sm font-medium ${statusColor}`}>
              {t(`profile.status.${profile.status}`)}
            </p>
          </div>
        </>
      )}

      {/* Language switcher */}
      <div className="mb-4 rounded-2xl bg-[var(--tg-secondary-bg-color)] p-4">
        <p className="mb-3 text-sm text-tg-hint">{t("profile.language")}</p>
        <div className="flex gap-3">
          {(["uz", "ru"] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => changeLanguage(lang)}
              className={`flex-1 rounded-xl py-2.5 font-medium ${
                me?.user.language === lang
                  ? "bg-brand text-white"
                  : "bg-[var(--tg-bg-color)] text-tg"
              }`}
            >
              {lang === "uz" ? "🇺🇿 O'zbek" : "🇷🇺 Русский"}
            </button>
          ))}
        </div>
      </div>

      <p className="text-center text-sm text-tg-hint">
        {t("profile.editComingSoon")}
      </p>
    </div>
  );
}
