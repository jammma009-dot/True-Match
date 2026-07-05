import type { Profile, Photo, User } from "@prisma/client";
import { computeAge } from "./age";
import { cityLabel } from "./cities";

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
  photos: { url: string; position: number }[];
}

export function toPublicProfile(
  user: Pick<User, "id">,
  profile: Profile,
  photos: Photo[],
): PublicProfile {
  return {
    userId: user.id,
    name: profile.name,
    age: computeAge(profile.birthdate),
    gender: profile.gender,
    intent: profile.intent,
    city: profile.city,
    cityLabel: cityLabel(profile.city),
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
    photos: photos
      .sort((a, b) => a.position - b.position)
      .map((p) => ({ id: p.id, url: p.url, position: p.position })),
  };
}
