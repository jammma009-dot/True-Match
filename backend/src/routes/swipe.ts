import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { checkAndIncrSwipe } from "../lib/ratelimit";
import { notifyNewMatch } from "../bot/notify";
import { SwipeAction } from "@prisma/client";

const router = Router();

/** Order a pair of user ids so matches are stored uniquely & unordered. */
export function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

const swipeSchema = z.object({
  targetUserId: z.string().min(1),
  action: z.nativeEnum(SwipeAction),
});

/**
 * POST /api/swipe
 * Records a like/pass. On a mutual like, creates a Match and notifies both
 * users via the bot. Rate-limited per user per day (Redis).
 */
router.post(
  "/",
  requireAuth,
  validateBody(swipeSchema),
  async (req: Request, res: Response) => {
    const user = req.authUser!;
    const { targetUserId, action } = req.body as z.infer<typeof swipeSchema>;

    if (targetUserId === user.id) {
      res.status(400).json({ error: "cannot_swipe_self" });
      return;
    }

    // Requester must be approved to swipe.
    const myProfile = await prisma.profile.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    if (!myProfile || myProfile.status !== "approved") {
      res.status(403).json({ error: "profile_not_approved" });
      return;
    }

    // Target must exist, be approved and not banned.
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { profile: { select: { status: true } } },
    });
    if (!target || target.isBanned || target.profile?.status !== "approved") {
      res.status(404).json({ error: "target_unavailable" });
      return;
    }

    // Block check (either direction).
    const block = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: user.id, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: user.id },
        ],
      },
    });
    if (block) {
      res.status(403).json({ error: "blocked" });
      return;
    }

    // Rate limit.
    const rl = await checkAndIncrSwipe(user.id);
    if (!rl.allowed) {
      res.status(429).json({ error: "rate_limited", remaining: 0 });
      return;
    }

    // Record swipe (idempotent on the pair).
    await prisma.swipe.upsert({
      where: {
        fromUserId_toUserId: { fromUserId: user.id, toUserId: targetUserId },
      },
      create: { fromUserId: user.id, toUserId: targetUserId, action },
      update: { action },
    });

    let matched = false;
    let matchId: string | null = null;

    if (action === "like") {
      // Did the target already like me?
      const reciprocal = await prisma.swipe.findUnique({
        where: {
          fromUserId_toUserId: {
            fromUserId: targetUserId,
            toUserId: user.id,
          },
        },
      });

      if (reciprocal && reciprocal.action === "like") {
        const [userAId, userBId] = orderPair(user.id, targetUserId);
        const match = await prisma.match.upsert({
          where: { userAId_userBId: { userAId, userBId } },
          create: { userAId, userBId },
          update: {},
        });
        matched = true;
        matchId = match.id;

        // Notify both users (fire and forget).
        void notifyNewMatch(user.id);
        void notifyNewMatch(targetUserId);
      }
    }

    res.json({ ok: true, matched, matchId, remaining: rl.remaining });
  },
);

export default router;
