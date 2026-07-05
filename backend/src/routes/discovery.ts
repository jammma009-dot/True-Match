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

  const candidates = await prisma.profile.findMany({
    where: {
      status: "approved",
      gender: oppositeGender,
      user: { isBanned: false },
      userId: { notIn: Array.from(excludeIds) },
    },
    include: { photos: true, user: { select: { id: true } } },
    take: 40,
  });

  // Same-city first, then everyone else. Light shuffle within groups.
  const sameCity = candidates.filter((c) => c.city === myProfile.city);
  const otherCity = candidates.filter((c) => c.city !== myProfile.city);
  const ordered = [...shuffle(sameCity), ...shuffle(otherCity)].slice(0, 20);

  const queue = ordered.map((c) =>
    toPublicProfile(c.user, c, c.photos),
  );

  res.json({ queue });
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
