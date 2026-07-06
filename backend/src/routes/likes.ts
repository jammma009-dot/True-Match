import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { toPublicProfile } from "../utils/serialize";

const router = Router();

/**
 * GET /api/likes
 * People who liked the current user and whom the user hasn't swiped on yet
 * (once you like them back it becomes a match; if you pass they're gone).
 * Returns their public profiles (photos are blurred client-side) plus a
 * `newCount` for the badge (likes received since the user last opened Likes).
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const user = req.authUser!;

  const [incoming, mySwipes, blocksMade, blocksAgainst] = await Promise.all([
    prisma.swipe.findMany({
      where: { toUserId: user.id, action: "like" },
      orderBy: { createdAt: "desc" },
    }),
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

  const excluded = new Set<string>();
  mySwipes.forEach((s) => excluded.add(s.toUserId));
  blocksMade.forEach((b) => excluded.add(b.blockedId));
  blocksAgainst.forEach((b) => excluded.add(b.blockerId));

  const pending = incoming.filter((s) => !excluded.has(s.fromUserId));
  const likerIds = [...new Set(pending.map((s) => s.fromUserId))];

  const profiles = await prisma.profile.findMany({
    where: {
      userId: { in: likerIds },
      status: "approved",
      user: { isBanned: false },
    },
    include: { photos: true, user: { select: { id: true } } },
  });
  const byId = new Map(profiles.map((p) => [p.userId, p]));

  const likes = likerIds
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => toPublicProfile(p.user, p, p.photos));

  const seenAt = user.lastLikesSeenAt;
  const newCount = pending.filter(
    (s) => byId.has(s.fromUserId) && (!seenAt || s.createdAt > seenAt),
  ).length;

  res.json({ likes, newCount });
});

/**
 * POST /api/likes/seen — mark likes as seen (clears the new-likes badge).
 */
router.post("/seen", requireAuth, async (req: Request, res: Response) => {
  const user = req.authUser!;
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLikesSeenAt: new Date() },
  });
  res.json({ ok: true });
});

export default router;
