import type { OwnProfile } from "../store/useStore";

/**
 * Per-field completion weights. Verification / bio / photos are worth 15% each;
 * the rest 13%. All fields done → capped at 100% → unlocks the free 1-day boost.
 */
export const WEIGHT = {
  photos: 15,
  bio: 15,
  verification: 15,
  height: 13,
  interests: 13,
  smoking: 13,
  drinking: 13,
  workStudy: 13,
} as const;

/** Whether verification counts (selfie submitted → pending, or verified). */
export function verificationDone(status: string): boolean {
  return status === "verified" || status === "pending";
}

export function profileCompletenessPct(p: OwnProfile): number {
  let sum = 0;
  if (p.photos.length >= 4) sum += WEIGHT.photos;
  if (p.bio) sum += WEIGHT.bio;
  if (verificationDone(p.verificationStatus)) sum += WEIGHT.verification;
  if (p.heightCm) sum += WEIGHT.height;
  if (p.interests.length >= 3) sum += WEIGHT.interests;
  if (p.smoking) sum += WEIGHT.smoking;
  if (p.drinking) sum += WEIGHT.drinking;
  if (p.studies || p.works) sum += WEIGHT.workStudy;
  return Math.min(100, sum);
}

export function isProfileComplete(p: OwnProfile): boolean {
  return profileCompletenessPct(p) >= 100;
}
