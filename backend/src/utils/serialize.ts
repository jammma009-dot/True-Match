import type { Profile, Photo, User } from "@prisma/client";
import { computeAge } from "./age";
import { cityLabel } from "./cities";
import { isPremiumActive } from "../lib/premium";

/**
 * Public-facing profile shape. NOTE: birthdate is never exposed — only the
 * computed age. Telegram IDs are never exposed to other users.
 */
export interface PublicProfile {
  userId: string;
  name: string;
  age: number;
  gender: string;
  intent: string;
  city: string;
  cityLabel: string;
  bio: string | null;
  heightCm: number | null;
  smoking: string | null;
  drinking: string | null;
  interests: string[];
  studies: boolean;
  works: boolean;
  education: string | null;
  work: string | null;
  isPremium: boolean;
  verified: boolean;
  photos: { url: string; position: number }[];
}

export function toPublicProfile(
  user: Pick<User, "id" | "premiumUntil">,
  profile: Profile,
  photos: Photo[],
): PublicProfile {
  return {
    userId: user.id,
    isPremium: isPremiumActive(user.premiumUntil),
    name: profile.name,
    age: computeAge(profile.birthdate),
    gender: profile.gender,
    intent: profile.intent,
    city: profile.city,
    cityLabel: cityLabel(profile.city),
    bio: profile.bio ?? null,
    heightCm: profile.heightCm ?? null,
    smoking: profile.smoking ?? null,
    drinking: profile.drinking ?? null,
    interests: profile.interests ?? [],
    studies: profile.studies ?? false,
    works: profile.works ?? false,
    education: profile.education ?? null,
    work: profile.work ?? null,
    verified: profile.verificationStatus === "verified",
    photos: photos
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ url: p.url, position: p.position })),
  };
}

/**
 * "My own" profile shape — includes status & rejection reason, still no raw
 * birthdate leakage beyond what the owner submitted (owner may see their age).
 */
export function toOwnProfile(profile: Profile, photos: Photo[]) {
  return {
    id: profile.id,
    name: profile.name,
    age: computeAge(profile.birthdate),
    birthdate: profile.birthdate.toISOString(),
    gender: profile.gender,
    genderLocked: profile.genderLocked,
    intent: profile.intent,
    city: profile.city,
    cityLabel: cityLabel(profile.city),
    status: profile.status,
    rejectionReason: profile.rejectionReason,
    bio: profile.bio ?? null,
    heightCm: profile.heightCm ?? null,
    smoking: profile.smoking ?? null,
    drinking: profile.drinking ?? null,
    interests: profile.interests ?? [],
    studies: profile.studies ?? false,
    works: profile.works ?? false,
    education: profile.education ?? null,
    work: profile.work ?? null,
    verified: profile.verificationStatus === "verified",
    verificationStatus: profile.verificationStatus,
    photos: photos
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ id: p.id, url: p.url, position: p.position, key: p.key })),
  };
}
