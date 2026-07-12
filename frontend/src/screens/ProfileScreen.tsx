import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin, Ruler, Pencil, ChevronRight, Trash2, MessageCircle, Crown, GraduationCap, Briefcase } from "lucide-react";
import { useStore, useT } from "../store/useStore";
import { api } from "../lib/api";
import { haptics, openTelegramLink } from "../lib/telegram";
import { INTEREST_ICON, SmokingIcon, DrinkingIcon } from "../lib/profileMeta";
import { EditProfileScreen } from "./EditProfileScreen";
import { PremiumModal } from "../components/PremiumModal";
import { PresentModal } from "../components/PresentModal";
import { ReferralModal } from "../components/ReferralModal";
import { PremiumBadge } from "../components/PremiumBadge";
import { VerifiedBadge } from "../components/VerifiedBadge";
import { Gift } from "lucide-react";
import { profileCompletenessPct } from "../lib/completeness";

export function ProfileScreen() {
  const t = useT();
  const me = useStore((s) => s.me);
  const queryClient = useQueryClient();
  const profile = me?.profile;
  const stats = me?.stats;
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const [showPresent, setShowPresent] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const contactUsername = me?.settings?.contactUsername ?? null;
  const paymentUsername = me?.settings?.paymentUsername ?? null;
  const priceStars = me?.settings?.premiumPriceStars ?? 250;
  const presentPrice = me?.settings?.presentPriceStars ?? 100;
  const isPremium = me?.user.isPremium ?? false;
  const isBoosted = me?.user.isBoosted ?? false;
  const myUserId = me?.user.id ?? "";

  const handleDelete = async () => {
    if (!window.confirm(t("profile.deleteConfirm"))) return;
    setDeleting(true);
    try {
      await api.deleteProfile();
      haptics.notify("warning");
      // Hard reload so the app boots into a clean first-run state. This makes
      // the fresh onboarding behave exactly like a first-time launch (fixes the
      // name field not accepting input after an in-session delete).
      window.location.reload();
    } catch {
      setDeleting(false);
    }
  };

  if (editing) {
    return <EditProfileScreen onClose={() => setEditing(false)} />;
  }

  const pct = profile ? profileCompletenessPct(profile) : 0;

  return (
    <div className="min-h-full px-4 pb-6 pt-4">
      {/* Centered header */}
      <div className="flex flex-col items-center text-center">
        <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-white/10 bg-[var(--tg-secondary-bg-color)]">
          {profile?.photos[0] ? (
            <img src={profile.photos[0].url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-4xl">👤</div>
          )}
        </div>
        <h1 className="mt-3 flex items-center justify-center gap-2 text-xl font-bold text-tg">
          <span>
            {profile?.name}
            {profile ? `, ${profile.age}` : ""}
          </span>
          {isPremium && <PremiumBadge variant="label" />}
          {profile?.verified && <VerifiedBadge />}
        </h1>
        {profile && (
          <p className="mt-0.5 flex items-center gap-1 text-sm text-tg-hint">
            <MapPin className="h-3.5 w-3.5" /> {t(`city.${profile.city}`)}
          </p>
        )}
      </div>

      {/* Stats row */}
      <div className="mt-4 flex items-center rounded-2xl border border-white/10 bg-[var(--tg-secondary-bg-color)] py-3">
        <Stat value={stats?.views ?? 0} label={t("profile.stat.views")} />
        <StatDivider />
        <Stat value={stats?.likes ?? 0} label={t("profile.stat.likes")} />
        <StatDivider />
        <Stat value={stats?.matches ?? 0} label={t("profile.stat.matches")} />
        <StatDivider />
        <Stat value={stats?.days ?? 1} label={t("profile.stat.days")} />
      </div>

      {/* Completion bar */}
      <div className="mt-3 rounded-2xl border border-white/10 bg-[var(--tg-secondary-bg-color)] px-4 py-3.5">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-tg">{t("profile.complete")}</span>
          <span className="font-semibold text-brand">{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand to-brand-dark transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Edit row (full width) */}
      <button
        type="button"
        onClick={() => {
          haptics.impact("light");
          setEditing(true);
        }}
        className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[var(--tg-secondary-bg-color)] px-4 py-3 text-left active:opacity-80"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/20 text-brand">
          <Pencil className="h-4 w-4" />
        </span>
        <span className="flex-1 font-semibold text-tg">{t("profile.editProfile")}</span>
        <ChevronRight className="h-5 w-5 text-tg-hint" />
      </button>

      {/* Details */}
      {profile && (
        <div className="mt-3 rounded-2xl border border-white/10 bg-[var(--tg-secondary-bg-color)] p-4">
          <div className="flex flex-wrap gap-2">
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
                <SmokingIcon className="h-3.5 w-3.5" /> {t(`habit.${profile.smoking}`)}
              </Badge>
            )}
            {profile.drinking && (
              <Badge>
                <DrinkingIcon className="h-3.5 w-3.5" /> {t(`habit.${profile.drinking}`)}
              </Badge>
            )}
            {profile.works && (
              <Badge tone="brand">
                <Briefcase className="h-3.5 w-3.5" /> {t("profile.workLabel")}
                {profile.work ? `: ${profile.work}` : ""}
              </Badge>
            )}
            {profile.studies && (
              <Badge tone="brand">
                <GraduationCap className="h-3.5 w-3.5" /> {t("profile.studyLabel")}
                {profile.education ? `: ${profile.education}` : ""}
              </Badge>
            )}
            <Badge>{t(`intent.${profile.intent}`)}</Badge>
          </div>

          {profile.bio && <p className="mt-3 text-sm text-tg">{profile.bio}</p>}

          {profile.interests.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-semibold text-tg-hint">
                {t("profile.interests")}
              </p>
              <div className="flex flex-wrap gap-2">
                {profile.interests.map((key) => {
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
      )}

      {/* Contact + Buy Premium */}
      <div className="mt-3 space-y-2.5">
        {contactUsername && (
          <button
            type="button"
            onClick={() => {
              haptics.impact("light");
              openTelegramLink(`https://t.me/${contactUsername}`);
            }}
            className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[var(--tg-secondary-bg-color)] px-4 py-3 text-left active:opacity-80"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/20 text-brand">
              <MessageCircle className="h-4 w-4" />
            </span>
            <span className="flex-1 font-semibold text-tg">{t("profile.contact")}</span>
            <ChevronRight className="h-5 w-5 text-tg-hint" />
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            haptics.impact("light");
            setShowPremium(true);
          }}
          className="flex w-full items-center gap-3 rounded-2xl border border-white/15 bg-gradient-to-r from-brand to-brand-dark px-4 py-3 text-left text-white active:opacity-90"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
            <Crown className="h-4 w-4" />
          </span>
          <span className="flex-1 font-semibold">{t("profile.premium")}</span>
          <ChevronRight className="h-5 w-5 text-white/80" />
        </button>

        {/* Buy Present (Boost) */}
        <button
          type="button"
          onClick={() => {
            haptics.impact("light");
            setShowPresent(true);
          }}
          className="flex w-full items-center gap-3 rounded-2xl border border-white/15 bg-gradient-to-r from-pink-500 to-brand px-4 py-3 text-left text-white active:opacity-90"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
            <Gift className="h-4 w-4" />
          </span>
          <span className="flex-1 font-semibold">
            {t("profile.present")}
            {isBoosted && (
              <span className="ml-2 rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                {t("present.activeTag")}
              </span>
            )}
          </span>
          <ChevronRight className="h-5 w-5 text-white/80" />
        </button>

        {/* Invite friends (referral) */}
        <button
          type="button"
          onClick={() => {
            haptics.impact("light");
            setShowReferral(true);
          }}
          className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[var(--tg-secondary-bg-color)] px-4 py-3 text-left active:opacity-80"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pink-500/20 text-pink-400">
            <Gift className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold text-tg">{t("referral.cardTitle")}</span>
            <span className="block text-xs text-tg-hint">{t("referral.cardSubtitle")}</span>
          </span>
          <ChevronRight className="h-5 w-5 text-tg-hint" />
        </button>
      </div>

      {/* Delete profile */}
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-pass/25 bg-pass/15 py-3 font-semibold text-pass active:opacity-80 disabled:opacity-50"
      >
        <Trash2 className="h-5 w-5" />
        {t("profile.delete")}
      </button>

      {showPremium && (
        <PremiumModal
          paymentUsername={paymentUsername}
          priceStars={priceStars}
          isPremium={isPremium}
          onPaid={() => {
            // Refresh /api/me so the Premium badge + status appear.
            queryClient.invalidateQueries({ queryKey: ["me"] });
            window.setTimeout(
              () => queryClient.invalidateQueries({ queryKey: ["me"] }),
              1500,
            );
          }}
          onClose={() => setShowPremium(false)}
        />
      )}

      {showPresent && (
        <PresentModal
          targetUserId={myUserId}
          isGift={false}
          priceStars={presentPrice}
          paymentUsername={paymentUsername}
          onPaid={() => {
            queryClient.invalidateQueries({ queryKey: ["me"] });
            window.setTimeout(
              () => queryClient.invalidateQueries({ queryKey: ["me"] }),
              1500,
            );
          }}
          onClose={() => setShowPresent(false)}
        />
      )}

      {showReferral && <ReferralModal onClose={() => setShowReferral(false)} />}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center px-2">
      <span className="text-lg font-bold text-brand">{value}</span>
      <span className="mt-1 text-center text-[9px] font-medium uppercase leading-tight tracking-tight text-tg-hint">
        {label}
      </span>
    </div>
  );
}

function StatDivider() {
  return <div className="h-8 w-px flex-shrink-0 bg-white/10" />;
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
