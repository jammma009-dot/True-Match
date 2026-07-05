import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStore, useT } from "../../store/useStore";
import { api, ApiError } from "../../lib/api";
import { Button, ProgressBar } from "../../components/ui";
import {
  showBackButton,
  hideBackButton,
  haptics,
  getTelegramFirstName,
} from "../../lib/telegram";
import { DatePicker, DateValue } from "./DatePicker";
import { CitySelect } from "./CitySelect";
import { PhotoGrid, UploadedPhoto } from "./PhotoGrid";

const STEPS = ["name", "birthdate", "gender", "intent", "city", "photos"] as const;
type Step = (typeof STEPS)[number];

const INTENT_ICONS: Record<string, string> = {
  serious: "❤️",
  marriage: "💍",
  flirt: "😉",
  friendship: "💬",
  unsure: "🤔",
};

function computeAge(d: DateValue): number {
  const birth = new Date(d.year, d.month - 1, d.day);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function OnboardingWizard() {
  const t = useT();
  const queryClient = useQueryClient();
  const intents = useStore((s) => s.me?.reference.intents ?? []);

  const [stepIndex, setStepIndex] = useState(0);
  const step: Step = STEPS[stepIndex];

  // Wizard state
  const [name, setName] = useState(getTelegramFirstName() ?? "");
  const [birthdate, setBirthdate] = useState<DateValue | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [intent, setIntent] = useState<string | null>(null);
  const [city, setCity] = useState<string>("toshkent");
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const age = birthdate ? computeAge(birthdate) : null;
  const underage = age !== null && age < 18;

  // Wire the Telegram back button once past step 1.
  useEffect(() => {
    if (stepIndex > 0) {
      showBackButton(() => goBack());
    } else {
      hideBackButton();
    }
    return () => hideBackButton();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  const goBack = () => {
    setError(null);
    setStepIndex((i) => Math.max(0, i - 1));
  };

  const canContinue = useMemo(() => {
    switch (step) {
      case "name":
        return name.trim().length > 0;
      case "birthdate":
        return birthdate !== null && !underage;
      case "gender":
        return gender !== null;
      case "intent":
        return intent !== null;
      case "city":
        return Boolean(city);
      case "photos":
        return photos.length >= 1;
    }
  }, [step, name, birthdate, underage, gender, intent, city, photos]);

  const next = async () => {
    if (!canContinue) return;
    haptics.impact("light");
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((i) => i + 1);
      return;
    }
    await submit();
  };

  const submit = async () => {
    if (!birthdate || !gender || !intent) return;
    setSubmitting(true);
    setError(null);
    try {
      const iso = `${birthdate.year}-${pad(birthdate.month)}-${pad(birthdate.day)}`;
      await api.submitProfile({
        name: name.trim(),
        birthdate: iso,
        gender,
        intent,
        city,
        photos: photos.map((p) => ({ key: p.key, url: p.url })),
      });
      haptics.notify("success");
      // Refresh /me so the app routes to the pending screen.
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      haptics.notify("error");
      if (err instanceof ApiError && err.code === "underage") {
        setError(t("onboarding.birthdate.underage"));
        setStepIndex(1);
      } else {
        setError(t("common.error"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const progress = (stepIndex + 1) / STEPS.length;

  return (
    <div className="flex min-h-full flex-col px-5 pb-6 pt-4">
      <ProgressBar value={progress} />

      <div className="flex-1 pt-8">
        {step === "name" && (
          <StepShell title={t("onboarding.name.title")} helper={t("onboarding.name.helper")}>
            <input
              autoFocus
              className="w-full rounded-xl bg-[var(--tg-secondary-bg-color)] px-4 py-3.5 text-lg text-tg outline-none placeholder:text-tg-hint"
              placeholder={t("onboarding.name.placeholder")}
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
            />
          </StepShell>
        )}

        {step === "birthdate" && (
          <StepShell title={t("onboarding.birthdate.title")} helper={t("onboarding.birthdate.helper")}>
            <button
              onClick={() => setShowDatePicker(true)}
              className="w-full rounded-xl bg-[var(--tg-secondary-bg-color)] px-4 py-3.5 text-left text-lg text-tg"
            >
              {birthdate
                ? `${pad(birthdate.day)}.${pad(birthdate.month)}.${birthdate.year}`
                : t("onboarding.birthdate.select")}
            </button>
            {underage && (
              <p className="mt-3 text-sm text-pass">
                {t("onboarding.birthdate.underage")}
              </p>
            )}
            {showDatePicker && (
              <DatePicker
                value={birthdate}
                onClose={() => setShowDatePicker(false)}
                onConfirm={(v) => {
                  setBirthdate(v);
                  setShowDatePicker(false);
                }}
              />
            )}
          </StepShell>
        )}

        {step === "gender" && (
          <StepShell title={t("onboarding.gender.title")}>
            <div className="grid grid-cols-2 gap-4">
              {(["male", "female"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => {
                    haptics.select();
                    setGender(g);
                  }}
                  className={`flex aspect-square flex-col items-center justify-center rounded-2xl text-lg font-semibold ${
                    gender === g
                      ? "bg-brand text-white"
                      : "bg-[var(--tg-secondary-bg-color)] text-tg"
                  }`}
                >
                  <span className="mb-2 text-4xl">{g === "male" ? "👨" : "👩"}</span>
                  {t(`onboarding.gender.${g}`)}
                </button>
              ))}
            </div>
            <p className="mt-4 text-sm text-tg-hint">
              {t("onboarding.gender.warning")}
            </p>
          </StepShell>
        )}

        {step === "intent" && (
          <StepShell title={t("onboarding.intent.title")}>
            <div className="space-y-3">
              {intents.map((it) => (
                <button
                  key={it}
                  onClick={() => {
                    haptics.select();
                    setIntent(it);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-4 text-left ${
                    intent === it
                      ? "bg-brand text-white"
                      : "bg-[var(--tg-secondary-bg-color)] text-tg"
                  }`}
                >
                  <span className="text-2xl">{INTENT_ICONS[it] ?? "•"}</span>
                  <span className="flex-1">{t(`intent.${it}`)}</span>
                  {intent === it && <span>✓</span>}
                </button>
              ))}
            </div>
          </StepShell>
        )}

        {step === "city" && (
          <StepShell title={t("onboarding.city.title")} helper={t("onboarding.city.helper")}>
            <CitySelect value={city} onChange={setCity} />
          </StepShell>
        )}

        {step === "photos" && (
          <StepShell title={t("onboarding.photos.title")}>
            <PhotoGrid photos={photos} onChange={setPhotos} />
          </StepShell>
        )}
      </div>

      {error && step !== "birthdate" && (
        <p className="mb-3 text-center text-sm text-pass">{error}</p>
      )}

      <Button onClick={next} disabled={!canContinue || submitting}>
        {submitting
          ? t("common.loading")
          : step === "photos"
            ? t("common.submit")
            : t("common.continue")}
      </Button>
    </div>
  );
}

function StepShell({
  title,
  helper,
  children,
}: {
  title: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-tg">{title}</h1>
      {helper && <p className="mb-6 text-sm text-tg-hint">{helper}</p>}
      {!helper && <div className="mb-6" />}
      {children}
    </div>
  );
}
