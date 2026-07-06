import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { isAdult, MIN_AGE } from "../utils/age";
import { toOwnProfile } from "../utils/serialize";
import { Gender, Intent, City, Habit } from "@prisma/client";
import { CITY_VALUES } from "../utils/cities";
import { INTEREST_SET, MAX_INTERESTS, MIN_HEIGHT, MAX_HEIGHT } from "../utils/interests";

const router = Router();

const photoInput = z.object({
  key: z.string().min(1),
  url: z.string().url(),
});

const submitSchema = z.object({
  name: z.string().trim().min(1).max(50),
  // ISO date string (YYYY-MM-DD)
  birthdate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "birthdate must be YYYY-MM-DD"),
  gender: z.nativeEnum(Gender),
  intent: z.nativeEnum(Intent),
  city: z.nativeEnum(City),
  photos: z.array(photoInput).min(1, "at least one photo is required").max(6),
});

/**
 * POST /api/profile
 * Create (or replace) the current user's profile from the onboarding wizard.
 * Enforces the server-side age gate (>= 18) — hard block, no rounding.
 * Sets status to `pending` for moderator review.
 */
router.post(
  "/",
  requireAuth,
  validateBody(submitSchema),
  async (req: Request, res: Response) => {
    const user = req.authUser!;
    const data = req.body as z.infer<typeof submitSchema>;

    // Parse & validate birthdate.
    const birthdate = new Date(`${data.birthdate}T00:00:00.000Z`);
    if (isNaN(birthdate.getTime())) {
      res.status(400).json({ error: "invalid_birthdate" });
      return;
    }

    // Server-side hard age gate.
    if (!isAdult(birthdate)) {
      res
        .status(403)
        .json({ error: "underage", minAge: MIN_AGE });
      return;
    }

    // If a profile already exists and gender is locked (approved), keep gender.
    const existing = await prisma.profile.findUnique({
      where: { userId: user.id },
    });

    const gender =
      existing?.genderLocked && existing.gender
        ? existing.gender
        : data.gender;

    // Upsert profile; wipe old photos and insert the new set.
    const profile = await prisma.$transaction(async (tx) => {
      const p = await tx.profile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          name: data.name,
          birthdate,
          gender,
          intent: data.intent,
          city: data.city,
          status: "pending",
        },
        update: {
          name: data.name,
          birthdate,
          gender,
          intent: data.intent,
          city: data.city,
          // Re-submitting a rejected profile puts it back in review.
          status: "pending",
          rejectionReason: null,
        },
      });

      await tx.photo.deleteMany({ where: { profileId: p.id } });
      await tx.photo.createMany({
        data: data.photos.map((ph, idx) => ({
          profileId: p.id,
          key: ph.key,
          url: ph.url,
          position: idx,
        })),
      });

      return p;
    });

    const photos = await prisma.photo.findMany({
      where: { profileId: profile.id },
    });

    res.status(201).json({ profile: toOwnProfile(profile, photos) });
  },
);

/**
 * PATCH /api/profile
 * Edit the current user's profile info (name, bio, height, interests, city,
 * intent, smoking, drinking). Does NOT change approval status or gender.
 */
const editSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  bio: z.string().trim().max(500).optional(),
  city: z.nativeEnum(City).optional(),
  intent: z.nativeEnum(Intent).optional(),
  heightCm: z.number().int().min(MIN_HEIGHT).max(MAX_HEIGHT).nullable().optional(),
  smoking: z.nativeEnum(Habit).nullable().optional(),
  drinking: z.nativeEnum(Habit).nullable().optional(),
  interests: z.array(z.string()).max(20).optional(),
  studies: z.boolean().optional(),
  works: z.boolean().optional(),
  education: z.string().trim().max(100).nullable().optional(),
  work: z.string().trim().max(100).nullable().optional(),
});

router.patch(
  "/",
  requireAuth,
  validateBody(editSchema),
  async (req: Request, res: Response) => {
    const user = req.authUser!;
    const data = req.body as z.infer<typeof editSchema>;

    const existing = await prisma.profile.findUnique({
      where: { userId: user.id },
    });
    if (!existing) {
      res.status(404).json({ error: "profile_not_found" });
      return;
    }

    // Keep only recognised interest keys, capped.
    const interests = data.interests
      ? data.interests.filter((i) => INTEREST_SET.has(i)).slice(0, MAX_INTERESTS)
      : undefined;

    const updated = await prisma.profile.update({
      where: { userId: user.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.bio !== undefined ? { bio: data.bio || null } : {}),
        ...(data.city !== undefined ? { city: data.city } : {}),
        ...(data.intent !== undefined ? { intent: data.intent } : {}),
        ...(data.heightCm !== undefined ? { heightCm: data.heightCm } : {}),
        ...(data.smoking !== undefined ? { smoking: data.smoking } : {}),
        ...(data.drinking !== undefined ? { drinking: data.drinking } : {}),
        ...(interests !== undefined ? { interests } : {}),
        ...(data.studies !== undefined ? { studies: data.studies } : {}),
        ...(data.works !== undefined ? { works: data.works } : {}),
        ...(data.education !== undefined ? { education: data.education || null } : {}),
        ...(data.work !== undefined ? { work: data.work || null } : {}),
      },
      include: { photos: true },
    });

    res.json({ profile: toOwnProfile(updated, updated.photos) });
  },
);

/**
 * POST /api/profile/verification { key, url }
 * Submit a verification selfie (holding two fingers) for admin review. Sets
 * verificationStatus to `pending`. The user can keep using the app meanwhile.
 */
const verifySchema = z.object({
  key: z.string().min(1),
  url: z.string().url(),
});
router.post(
  "/verification",
  requireAuth,
  validateBody(verifySchema),
  async (req: Request, res: Response) => {
    const user = req.authUser!;
    const { key, url } = req.body as z.infer<typeof verifySchema>;
    const profile = await prisma.profile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      res.status(404).json({ error: "profile_not_found" });
      return;
    }
    await prisma.profile.update({
      where: { userId: user.id },
      data: {
        verificationStatus: "pending",
        verificationKey: key,
        verificationPhotoUrl: url,
      },
    });
    res.json({ ok: true });
  },
);

/**
 * DELETE /api/profile
 * Delete the current user's account entirely (profile, photos, swipes, matches,
 * messages, reports, blocks all cascade). Reopening the app starts fresh.
 */
router.delete("/", requireAuth, async (req: Request, res: Response) => {
  const user = req.authUser!;
  await prisma.user.delete({ where: { id: user.id } });
  res.json({ ok: true });
});

// Ensure CITY_VALUES is referenced (keeps enum + list in sync at build time).
void CITY_VALUES;

export default router;
