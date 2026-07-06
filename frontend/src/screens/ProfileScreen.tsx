import { useState } from "react";
import { MapPin, Ruler, Pencil } from "lucide-react";
import { useStore, useT } from "../store/useStore";
import { api } from "../lib/api";
import { Locale } from "../i18n";
import { haptics } from "../lib/telegram";
import { INTEREST_EMOJI, SMOKING_EMOJI, DRINKING_EMOJI } from "../lib/profileMeta";
import { EditProfileScreen } from "./EditProfileScreen";

export function ProfileScreen() {
  const t = useT();
  const me = useStore((s) => s.me);
  const setLanguage = useStore((s) => s.setLanguage);
  const profile = me?.profile;
  const [editing, setEditing] = useState(false);

  const changeLanguage = async (lang: Locale) => {
    haptics.select();
    setLanguage(lang);
    try {
      await api.setLanguage(lang);
    } catch {
      /* ignore */
    }
  };

  if (editing) {
    return <EditProfileScreen onClose={() => setEditing(false)} />;
  }

  const statusColor =
    profile?.status === "approved"
      ? "text-like"
      : profile?.status === "rejected"
        ? "text-pass"
        : "text-tg-hint";

  return (
    <div className="min-h-full px-4 pb-8 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-tg">{t("profile.title")}</h1>
        <button
          type="button"
          onClick={() => {
            haptics.impact("light");
            setEditing(true);
          }}
          className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white active:scale-95"
        >
          <Pencil className="h-4 w-4" />
          {t("profile.editProfile")}
        </button>
      </div>

      {profile && (
        <>
          {profile.photos[0] && (
            <div className="mb-4 aspect-square w-full overflow-hidden rounded-3xl bg-[var(--tg-secondary-bg-color)]">
              <img src={profile.photos[0].url} alt="" className="h-full w-full object-cover" />
            </div>
          )}

          <div className="mb-4 rounded-2xl bg-[var(--tg-secondary-bg-color)] p-4">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-tg">{profile.name}</span>
              <span className="text-tg-hint">{profile.age}</span>
            </div>

            {/* Badges */}
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge>
                <MapPin className="h-3.5 w-3.5" /> {profile.cityLabel}
              </Badge>
              <Badge>
                {profile.gender === "male"
                  ? t("onboarding.gender.male")
                  : t("onboarding.gender.female")}
              </Badge>
              {profile.heightCm && (
                <Badge tone="brand">
                  <Ruler className="h-3.5 w-3.5" /> {profile.heightCm} cm
                </Badge>
              )}
              {profile.smoking && (
                <Badge>
                  {SMOKING_EMOJI} {t(`habit.${profile.smoking}`)}
                </Badge>
              )}
              {profile.drinking && (
                <Badge>
                  {DRINKING_EMOJI} {t(`habit.${profile.drinking}`)}
                </Badge>
              )}
            </div>

            {profile.bio && <p className="mt-3 text-sm text-tg">{profile.bio}</p>}

            {profile.interests.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-semibold text-tg-hint">
                  {t("profile.interests")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {profile.interests.map((key) => (
                    <Badge key={key}>
                      {INTEREST_EMOJI[key] ?? "•"} {t(`interest.${key}`)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-3 text-sm text-tg-hint">{t(`intent.${profile.intent}`)}</p>
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
                me?.user.language === lang ? "bg-brand text-white" : "bg-[var(--tg-bg-color)] text-tg"
              }`}
            >
              {lang === "uz" ? "🇺🇿 O'zbek" : "🇷🇺 Русский"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "brand";
}) {
  const styles =
    tone === "brand"
      ? "bg-brand/20 text-white border border-brand/40"
      : "bg-white/10 text-tg border border-white/10";
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${styles}`}
    >
      {children}
    </span>
  );
}
