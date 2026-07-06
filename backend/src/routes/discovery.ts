import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { toPublicProfile } from "../utils/serialize";
import { Gender } from "@prisma/client";

const router = Router();

/**
 * GET /api/discovery
 * Returns a queue of candidate profiles for the swipe screen.
 * Rules:
 *   - only APPROVED profiles (and requester must be approved)
 *   - opposite gender (simple hetero matching for MVP)
 *   - excludes already-swiped users
 *   - excludes users blocked by, or who blocked, the requester
 *   - same city first, then others as a fallback
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const user = req.authUser!;

  const myProfile = await prisma.profile.findUnique({
    where: { userId: user.id },
  });

  if (!myProfile || myProfile.status !== "approved") {
    res.status(403).json({ error: "profile_not_approved" });
    return;
  }

  // Gather exclusion sets.
  const [swipes, blocksMade, blocksAgainst] = await Promise.all([
    prisma.swipe.findMany({
      where: { fromUserId: user.id },
      select: { toUserId: true },
    }),
    prisma.block.findMany({
      where: { blockerId: user.id },
      select: { blockedId: true },
    }),
    prisma.block.findMany({
      where: { blockedId: user.id },
      select: { blockerId: true },
    }),
  ]);

  const excludeIds = new Set<string>([user.id]);
  swipes.forEach((s) => excludeIds.add(s.toUserId));
  blocksMade.forEach((b) => excludeIds.add(b.blockedId));
  blocksAgainst.forEach((b) => excludeIds.add(b.blockerId));

  const oppositeGender: Gender =
    myProfile.gender === "male" ? "female" : "male";

  const scope = req.query.scope === "nearby" ? "nearby" : "foryou";

  // Age filter → birthdate range. Defaults 18–99, clamped.
  const minAge = Math.max(18, parseInt(String(req.query.minAge ?? "18"), 10) || 18);
  const maxAge = Math.min(99, Math.max(minAge, parseInt(String(req.query.maxAge ?? "99"), 10) || 99));
  const now = new Date();
  // Youngest allowed → latest birthdate; oldest allowed → earliest birthdate.
  const maxBirth = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate());
  const minBirth = new Date(now.getFullYear() - maxAge - 1, now.getMonth(), now.getDate());

  const baseWhere = {
    status: "approved" as const,
    gender: oppositeGender,
    user: { isBanned: false },
    userId: { notIn: Array.from(excludeIds) },
    birthdate: { gte: minBirth, lte: maxBirth },
  };
  const include = { photos: true, user: { select: { id: true } } };

  // Fetch same-city and other-city candidates in SEPARATE queries so that
  // same-city people are always found (not lost inside a generic slice).
  const [sameCityRaw, otherCityRaw] = await Promise.all([
    prisma.profile.findMany({
      where: { ...baseWhere, city: myProfile.city },
      include,
      take: 50,
    }),
    prisma.profile.findMany({
      where: { ...baseWhere, city: { not: myProfile.city } },
      include,
      take: 50,
    }),
  ]);

  const sameCity = shuffle(sameCityRaw);
  const otherCity = shuffle(otherCityRaw);

  // "nearby": same-city first, then other cities as a fallback once the local
  // ones run out. "foryou": a shuffled mix of everyone from all locations.
  const ordered =
    scope === "nearby"
      ? [...sameCity, ...otherCity]
      : shuffle([...sameCityRaw, ...otherCityRaw]);

  const queue = ordered
    .slice(0, 30)
    .map((c) => toPublicProfile(c.user, c, c.photos));

  res.json({ queue, scope });
});

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default router;
