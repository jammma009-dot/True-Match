import type { OwnProfile } from "../store/useStore";

/**
 * Profile completeness as a 0–100 percentage. Six equally-weighted factors:
 * 3 photos, bio, height, 3 interests, smoking, drinking. Kept in sync with the
 * backend's isProfileComplete() used for the free-boost reward.
 */
export function profileCompletenessPct(p: OwnProfile): number {
  let score = 0;
  const total = 6;
  score += Math.min(p.photos.length / 3, 1);
  if (p.bio) score += 1;
  if (p.heightCm) score += 1;
  score += Math.min(p.interests.length / 3, 1);
  if (p.smoking) score += 1;
  if (p.drinking) score += 1;
  return Math.round((score / total) * 100);
}

export function isProfileComplete(p: OwnProfile): boolean {
  return (
    p.photos.length >= 3 &&
    !!p.bio &&
    !!p.heightCm &&
    p.interests.length >= 3 &&
    !!p.smoking &&
    !!p.drinking
  );
}
