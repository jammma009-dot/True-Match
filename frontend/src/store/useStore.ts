import { create } from "zustand";
import { Locale, translate } from "../i18n";

export type ProfileStatus = "pending" | "approved" | "rejected";

export interface OwnProfile {
  id: string;
  name: string;
  age: number;
  birthdate: string;
  gender: "male" | "female";
  genderLocked: boolean;
  intent: string;
  city: string;
  cityLabel: string;
  status: ProfileStatus;
  rejectionReason: string | null;
  bio: string | null;
  heightCm: number | null;
  smoking: string | null;
  drinking: string | null;
  interests: string[];
  photos: { id: string; url: string; position: number }[];
}

export interface CityRef {
  value: string;
  label: string;
}

export interface MeResponse {
  user: { id: string; language: Locale; isBanned: boolean };
  profile: OwnProfile | null;
  stats?: { views: number; likes: number; matches: number; days: number };
  settings?: { contactUsername: string | null; paymentUsername: string | null };
  reference: {
    cities: CityRef[];
    intents: string[];
    genders: string[];
    interests: string[];
    habits: string[];
    height: { min: number; max: number };
  };
}

interface AppState {
  language: Locale;
  setLanguage: (l: Locale) => void;

  me: MeResponse | null;
  setMe: (me: MeResponse) => void;

  // Convenience translate bound to current language
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export const useStore = create<AppState>((set, get) => ({
  language: "uz",
  setLanguage: (language) => set({ language }),

  me: null,
  setMe: (me) => set({ me, language: me.user.language }),

  t: (key, vars) => translate(get().language, key, vars),
}));

/** Hook returning the translate function bound to the current language. */
export function useT() {
  return useStore((s) => s.t);
}
