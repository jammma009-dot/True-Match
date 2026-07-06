import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createPresignedUpload, r2Enabled } from "../lib/r2";
import { prisma } from "../lib/prisma";
import { toOwnProfile } from "../utils/serialize";

const router = Router();

/**
 * POST /api/photos/presign
 * Returns a presigned R2 PUT URL so the frontend can upload a photo directly
 * to R2. The file bytes never touch this server.
 *
 * Flow per slot:
 *   1. POST /photos/presign { contentType } -> { key, uploadUrl, publicUrl }
 *   2. Frontend PUTs the file bytes to uploadUrl
 *   3. Frontend includes { key, url: publicUrl } in the profile submit payload
 */
const presignSchema = z.object({
  contentType: z
    .string()
    .refine(
      (v) => ["image/jpeg", "image/png", "image/webp"].includes(v),
      "Unsupported image type",
    ),
});

router.post(
  "/presign",
  requireAuth,
  validateBody(presignSchema),
  async (req: Request, res: Response) => {
    if (!r2Enabled()) {
      res.status(503).json({ error: "storage_not_configured" });
      return;
    }
    const user = req.authUser!;
    const { contentType } = req.body as z.infer<typeof presignSchema>;
    try {
      const upload = await createPresignedUpload(user.id, contentType);
      res.json(upload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[photos] presign error:", err);
      res.status(500).json({ error: "presign_failed" });
    }
  },
);

/**
 * PUT /api/photos
 * Replace the current user's photo set (add / remove / reorder from the profile
 * editor). Requires at least one photo. Does NOT change approval status.
 */
const setPhotosSchema = z.object({
  photos: z
    .array(z.object({ key: z.string().min(1), url: z.string().url() }))
    .min(1, "at least one photo is required")
    .max(6),
});

router.put(
  "/",
  requireAuth,
  validateBody(setPhotosSchema),
  async (req: Request, res: Response) => {
    const user = req.authUser!;
    const { photos } = req.body as z.infer<typeof setPhotosSchema>;

    const profile = await prisma.profile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) {
      res.status(404).json({ error: "profile_not_found" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.photo.deleteMany({ where: { profileId: profile.id } });
      await tx.photo.createMany({
        data: photos.map((p, idx) => ({
          profileId: profile.id,
          key: p.key,
          url: p.url,
          position: idx,
        })),
      });
    });

    const updated = await prisma.photo.findMany({
      where: { profileId: profile.id },
    });
    res.json({ profile: toOwnProfile(profile, updated) });
  },
);

export default router;
