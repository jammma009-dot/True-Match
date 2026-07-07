import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { toOwnProfile } from "../utils/serialize";
import { CITIES } from "../utils/cities";
import { INTERESTS, MIN_HEIGHT, MAX_HEIGHT } from "../utils/interests";
import { getSettings } from "../lib/settings";
import {
  isPremiumActive,
  DEFAULT_PREMIUM_STARS,
  isBoostActive,
  DEFAULT_PRESENT_STARS,
  DEFAULT_PREMIUM_UZS,
  DEFAULT_PRESENT_UZS,
} from "../lib/premium";
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

  // Profile stats for the profile header.
  const [views, likes, matches] = await Promise.all([
    prisma.swipe.count({ where: { toUserId: user.id } }),
    prisma.swipe.count({ where: { toUserId: user.id, action: "like" } }),
    prisma.match.count({
      where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
    }),
  ]);
  const days = Math.max(
    1,
    Math.floor((Date.now() - user.createdAt.getTime()) / 86_400_000) + 1,
  );

  const settings = await getSettings();

  res.json({
    settings: {
      contactUsername: settings.contactUsername,
      paymentUsername: settings.paymentUsername,
      premiumPriceStars: settings.premiumPriceStars ?? DEFAULT_PREMIUM_STARS,
      presentPriceStars: settings.presentPriceStars ?? DEFAULT_PRESENT_STARS,
      // Automated card-to-card payment (CardXabar). `cardNumber` presence tells
      // the client to use the in-app order flow instead of forwarding to a chat.
      cardNumber: settings.cardNumber ?? null,
      cardHolder: settings.cardHolder ?? null,
      premiumPriceUzs: settings.premiumPriceUzs ?? DEFAULT_PREMIUM_UZS,
      presentPriceUzs: settings.presentPriceUzs ?? DEFAULT_PRESENT_UZS,
    },
    user: {
      id: user.id,
      language: user.language,
      isBanned: user.isBanned,
      isPremium: isPremiumActive(user.premiumUntil),
      premiumUntil: user.premiumUntil ? user.premiumUntil.toISOString() : null,
      isBoosted: isBoostActive(user.boostUntil),
      boostUntil: user.boostUntil ? user.boostUntil.toISOString() : null,
      freeBoostClaimed: user.freeBoostClaimed,
    },
    profile: profile ? toOwnProfile(profile, profile.photos) : null,
    stats: { views, likes, matches, days },
    reference: {
      cities: CITIES,
      intents: ["serious", "marriage", "flirt", "friendship", "unsure"],
      genders: ["male", "female"],
      interests: INTERESTS,
      habits: ["never", "sometimes", "often"],
      height: { min: MIN_HEIGHT, max: MAX_HEIGHT },
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
