import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { toOwnProfile } from "../utils/serialize";
import { CITIES } from "../utils/cities";
import { Language } from "@prisma/client";

const router = Router();

/**
 * GET /api/me
 * Returns the current user, their profile (if any), and reference data
 * (cities, intents) the frontend needs. Drives routing:
 *   - no profile        -> onboarding
 *   - status pending    -> pending screen
 *   - status rejected   -> rejected screen
 *   - status approved   -> main app
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const user = req.authUser!;
  const profile = await prisma.profile.findUnique({
    where: { userId: user.id },
    include: { photos: true },
  });

  res.json({
    user: {
      id: user.id,
      language: user.language,
      isBanned: user.isBanned,
    },
    profile: profile ? toOwnProfile(profile, profile.photos) : null,
    reference: {
      cities: CITIES,
      intents: ["serious", "marriage", "flirt", "friendship", "unsure"],
      genders: ["male", "female"],
    },
  });
});

/**
 * PATCH /api/me/language — let the user change language from within the app.
 */
const langSchema = z.object({ language: z.nativeEnum(Language) });
router.patch(
  "/language",
  requireAuth,
  validateBody(langSchema),
  async (req: Request, res: Response) => {
    const user = req.authUser!;
    const { language } = req.body as z.infer<typeof langSchema>;
    await prisma.user.update({ where: { id: user.id }, data: { language } });
    res.json({ ok: true, language });
  },
);

/**
 * POST /api/me/presence — mark the user online/offline. Used to decide whether
 * to send a bot notification for new messages.
 */
const presenceSchema = z.object({ online: z.boolean() });
router.post(
  "/presence",
  requireAuth,
  validateBody(presenceSchema),
  async (req: Request, res: Response) => {
    const user = req.authUser!;
    const { online } = req.body as z.infer<typeof presenceSchema>;
    await prisma.user.update({
      where: { id: user.id },
      data: { isOnline: online, lastSeenAt: new Date() },
    });
    res.json({ ok: true });
  },
);

export default router;
