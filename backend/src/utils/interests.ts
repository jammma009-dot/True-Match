/**
 * Fixed set of selectable interests (stored as string keys on the profile).
 * Labels + emojis live on the frontend; the backend only validates the keys.
 */
export const INTERESTS = [
  "sports",
  "movies",
  "music",
  "food",
  "travel",
  "books",
  "gaming",
  "art",
  "cooking",
  "fitness",
  "nature",
  "photography",
  "coffee",
  "pets",
  "dancing",
  "fashion",
] as const;

export const INTEREST_SET = new Set<string>(INTERESTS);

export const MAX_INTERESTS = 10;

export const MIN_HEIGHT = 140;
export const MAX_HEIGHT = 220;
