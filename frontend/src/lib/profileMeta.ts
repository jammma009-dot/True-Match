/**
 * Frontend metadata for profile attributes: emoji for each interest + habit.
 * Labels are localized via i18n (keys `interest.<key>` and `habit.<key>`).
 */
export const INTEREST_EMOJI: Record<string, string> = {
  sports: "⚽",
  movies: "🎬",
  music: "🎵",
  food: "🍔",
  travel: "✈️",
  books: "📚",
  gaming: "🎮",
  art: "🎨",
  cooking: "🍳",
  fitness: "💪",
  nature: "🌿",
  photography: "📷",
  coffee: "☕",
  pets: "🐾",
  dancing: "💃",
  fashion: "👗",
};

export const SMOKING_EMOJI = "🚬";
export const DRINKING_EMOJI = "🍷";

export const DEFAULT_MIN_HEIGHT = 140;
export const DEFAULT_MAX_HEIGHT = 220;
