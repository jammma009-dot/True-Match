import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, MapPin, Ruler, Heart, MessageCircle, Gift, GraduationCap, Briefcase } from "lucide-react";
import { api } from "../lib/api";
import { useStore, useT } from "../store/useStore";
import { INTEREST_ICON, SmokingIcon, DrinkingIcon } from "../lib/profileMeta";
import { PremiumBadge } from "./PremiumBadge";
import { PresentModal } from "./PresentModal";
import { Spinner } from "./ui";
import { haptics } from "../lib/telegram";

/**
 * Full profile of a matched person — opened from the chat header. Styled like
 * the swipe card (photo carousel + info), with a "Message them" button that
 * returns to the conversation.
 */
export function MatchProfileView({
  matchId,
  onClose,
}: {
  matchId: string;
  onClose: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const presentPrice = useStore((s) => s.me?.settings?.presentPriceStars) ?? 100;
  const [photoIdx, setPhotoIdx] = useState(0);
  const [showPresent, setShowPresent] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["matchProfile", matchId],
    queryFn: () => api.getMatchProfile(matchId),
  });
  const p = data?.profile;
  const isPremium = p?.isPremium ?? false;
  const photos = p?.photos ?? [];
  const photo = photos[photoIdx]?.url ?? photos[0]?.url;

  const cyclePhoto = (e: React.MouseEvent<HTMLDivElement>) => {
    if (photos.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    haptics.select();
    if (rel < 0.4) setPhotoIdx((i) => (i - 1 + photos.length) % photos.length);
    else setPhotoIdx((i) => (i + 1) % photos.length);
  };

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-tg" style={{ backgroundColor: "#050608" }}>
      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-2 px-3 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white active:bg-black/60"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="flex-1 text-base font-bold text-tg">{t("profileView.title")}</h1>
      </div>

      {isLoading || !p ? (
        <Spinner />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            {/* Photo card */}
            <div
              onClick={cyclePhoto}
              className={`relative aspect-[3/4] w-full overflow-hidden rounded-[24px] bg-neutral-900 ${
                isPremium ? "ring-2 ring-amber-400" : ""
              }`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-brand/40 via-neutral-800 to-neutral-950" />
              {photo && (
                <img
                  src={photo}
                  alt={p.name}
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}

              {/* Progress bars */}
              {photos.length > 1 && (
                <div className="absolute inset-x-3 top-3 z-20 flex gap-1.5">
                  {photos.map((_, i) => (
                    <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
                      <div className={`h-full rounded-full bg-white ${i === photoIdx ? "w-full" : "w-0"}`} />
                    </div>
                  ))}
                </div>
              )}

              {/* Info overlay */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/40 to-transparent px-4 pb-4 pt-10">
                <div className="mb-0.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-brand">
                  <Heart className="h-3 w-3" fill="currentColor" />
                  {t(`intent.${p.intent}`)}
                </div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-extrabold leading-none text-white">{p.name}</h2>
                  <span className="text-lg font-light text-white/90">{p.age}</span>
                  {isPremium && <PremiumBadge variant="label" />}
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge>
                <MapPin className="h-3.5 w-3.5" /> {t(`city.${p.city}`)}
              </Badge>
              <Badge>
                {p.gender === "male" ? t("onboarding.gender.male") : t("onboarding.gender.female")}
              </Badge>
              {p.heightCm && (
                <Badge tone="brand">
                  <Ruler className="h-3.5 w-3.5" /> {p.heightCm} cm
                </Badge>
              )}
              {p.smoking && (
                <Badge>
                  <SmokingIcon className="h-3.5 w-3.5" /> {t(`habit.${p.smoking}`)}
                </Badge>
              )}
              {p.drinking && (
                <Badge>
                  <DrinkingIcon className="h-3.5 w-3.5" /> {t(`habit.${p.drinking}`)}
                </Badge>
              )}
              {p.work && (
                <Badge tone="brand">
                  <Briefcase className="h-3.5 w-3.5" /> {t("profile.workLabel")}: {p.work}
                </Badge>
              )}
              {p.education && (
                <Badge tone="brand">
                  <GraduationCap className="h-3.5 w-3.5" /> {t("profile.studyLabel")}: {p.education}
                </Badge>
              )}
            </div>

            {p.bio && <p className="mt-4 text-[15px] leading-relaxed text-tg">{p.bio}</p>}

            {p.interests.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold text-tg-hint">
                  {t("profile.interests")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {p.interests.map((key) => {
                    const Icon = INTEREST_ICON[key];
                    return (
                      <Badge key={key}>
                        {Icon && <Icon className="h-3.5 w-3.5" />} {t(`interest.${key}`)}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Actions: send present + message them */}
          <div className="flex-shrink-0 gap-3 border-t border-white/5 p-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  haptics.impact("light");
                  setShowPresent(true);
                }}
                className="flex flex-shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-500 to-brand px-4 py-4 font-semibold text-white active:opacity-90"
              >
                <Gift className="h-5 w-5" />
                {t("profileView.present")}
              </button>
              <button
                type="button"
                onClick={() => {
                  haptics.impact("light");
                  onClose();
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand to-brand-dark py-4 font-semibold text-white active:opacity-90"
              >
                <MessageCircle className="h-5 w-5" />
                {t("profileView.message")}
              </button>
            </div>
          </div>

          {showPresent && (
            <PresentModal
              targetUserId={p.userId}
              targetName={p.name}
              isGift
              priceStars={presentPrice}
              onPaid={() => {
                queryClient.invalidateQueries({ queryKey: ["matchProfile", matchId] });
              }}
              onClose={() => setShowPresent(false)}
            />
          )}
        </>
      )}
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
    <span className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${styles}`}>
      {children}
    </span>
  );
}
