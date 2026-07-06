import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Ruler } from "lucide-react";
import { useStore, useT } from "../store/useStore";
import { api } from "../lib/api";
import { INTEREST_EMOJI, SMOKING_EMOJI, DRINKING_EMOJI } from "../lib/profileMeta";
import { showBackButton, hideBackButton, haptics } from "../lib/telegram";
import { CitySelect } from "./onboarding/CitySelect";

const MAX_INTERESTS = 10;

const INTENT_ICONS: Record<string, string> = {
  serious: "❤️",
  marriage: "💍",
  flirt: "😉",
  friendship: "💬",
  unsure: "🤔",
};

/**
 * Full-screen profile editor. Lets the user set bio, height, interests,
 * smoking/drinking, city and intent. Saves via PATCH /api/profile.
 */
export function EditProfileScreen({ onClose }: { onClose: () => void }) {
  const t = useT();
  const me = useStore((s) => s.me);
  const queryClient = useQueryClient();
  const profile = me?.profile;
  const ref = me?.reference;

  const [name, setName] = useState(profile?.name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [city, setCity] = useState(profile?.city ?? "toshkent");
  const [intent, setIntent] = useState(profile?.intent ?? "serious");
  const [height, setHeight] = useState<number>(profile?.heightCm ?? 170);
  const [smoking, setSmoking] = useState<string | null>(profile?.smoking ?? null);
  const [drinking, setDrinking] = useState<string | null>(profile?.drinking ?? null);
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    showBackButton(onClose);
    return () => hideBackButton();
  }, [onClose]);

  const hMin = ref?.height.min ?? 140;
  const hMax = ref?.height.max ?? 220;

  const toggleInterest = (key: string) => {
    haptics.select();
    setInterests((prev) =>
      prev.includes(key)
        ? prev.filter((i) => i !== key)
        : prev.length >= MAX_INTERESTS
          ? prev
          : [...prev, key],
    );
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.updateProfile({
        name: name.trim(),
        bio: bio.trim(),
        city,
        intent,
        heightCm: height,
        smoking,
        drinking,
        interests,
      });
      haptics.notify("success");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      onClose();
    } catch {
      haptics.notify("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-tg">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-white/5 bg-[var(--tg-secondary-bg-color)] px-3 py-3">
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full text-tg active:bg-white/10"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="flex-1 text-lg font-bold text-tg">{t("edit.title")}</h1>
        <button
          type="button"
          onClick={save}
          disabled={saving || !name.trim()}
          className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? "..." : t("edit.save")}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-6 overflow-y-auto p-4 pb-10">
        {/* Name */}
        <Field label={t("edit.name")}>
          <input
            className="w-full rounded-xl bg-[var(--tg-secondary-bg-color)] px-4 py-3 text-tg outline-none"
            value={name}
            maxLength={50}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        {/* Bio */}
        <Field label={t("edit.bio")}>
          <textarea
            className="w-full rounded-xl bg-[var(--tg-secondary-bg-color)] px-4 py-3 text-tg outline-none placeholder:text-tg-hint"
            rows={3}
            maxLength={500}
            placeholder={t("edit.bioPlaceholder")}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
          <p className="mt-1 text-right text-xs text-tg-hint">{bio.length}/500</p>
        </Field>

        {/* Height */}
        <Field label={t("edit.height")}>
          <div className="rounded-xl bg-[var(--tg-secondary-bg-color)] p-4">
            <div className="mb-2 flex items-center gap-2">
              <Ruler className="h-5 w-5 text-brand" />
              <span className="text-lg font-semibold text-tg">{height} cm</span>
            </div>
            <input
              type="range"
              min={hMin}
              max={hMax}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
              className="w-full"
              style={{ accentColor: "#ff2e9a" }}
            />
          </div>
        </Field>

        {/* Interests */}
        <Field label={`${t("edit.interests")} (${interests.length}/${MAX_INTERESTS})`}>
          <div className="flex flex-wrap gap-2">
            {(ref?.interests ?? []).map((key) => {
              const active = interests.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleInterest(key)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand text-white"
                      : "bg-[var(--tg-secondary-bg-color)] text-tg"
                  }`}
                >
                  <span>{INTEREST_EMOJI[key] ?? "•"}</span>
                  {t(`interest.${key}`)}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Smoking */}
        <Field label={`${SMOKING_EMOJI} ${t("edit.smoking")}`}>
          <HabitPicker
            value={smoking}
            options={ref?.habits ?? ["never", "sometimes", "often"]}
            onChange={setSmoking}
            t={t}
          />
        </Field>

        {/* Drinking */}
        <Field label={`${DRINKING_EMOJI} ${t("edit.drinking")}`}>
          <HabitPicker
            value={drinking}
            options={ref?.habits ?? ["never", "sometimes", "often"]}
            onChange={setDrinking}
            t={t}
          />
        </Field>

        {/* Intent */}
        <Field label={t("edit.intent")}>
          <div className="space-y-2">
            {(ref?.intents ?? []).map((it) => (
              <button
                key={it}
                type="button"
                onClick={() => {
                  haptics.select();
                  setIntent(it);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left ${
                  intent === it ? "bg-brand text-white" : "bg-[var(--tg-secondary-bg-color)] text-tg"
                }`}
              >
                <span className="text-xl">{INTENT_ICONS[it] ?? "•"}</span>
                <span className="flex-1">{t(`intent.${it}`)}</span>
                {intent === it && <span>✓</span>}
              </button>
            ))}
          </div>
        </Field>

        {/* City */}
        <Field label={t("edit.city")}>
          <CitySelect value={city} onChange={setCity} />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-tg-hint">{label}</p>
      {children}
    </div>
  );
}

function HabitPicker({
  value,
  options,
  onChange,
  t,
}: {
  value: string | null;
  options: string[];
  onChange: (v: string | null) => void;
  t: (k: string) => string;
}) {
  return (
    <div className="flex gap-2">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => {
              haptics.select();
              onChange(active ? null : opt); // tap again to clear
            }}
            className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors ${
              active ? "bg-brand text-white" : "bg-[var(--tg-secondary-bg-color)] text-tg"
            }`}
          >
            {t(`habit.${opt}`)}
          </button>
        );
      })}
    </div>
  );
}
