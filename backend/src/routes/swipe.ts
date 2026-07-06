import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { checkAndIncrSwipe } from "../lib/ratelimit";
import { notifyNewMatch, notifyNewLike } from "../bot/notify";
import { emitToUser } from "../socket";
import { computeAge } from "../utils/age";
import { cityLabel } from "../utils/cities";
import { toPublicProfile } from "../utils/serialize";
import { isPremiumActive, FREE_DAILY_LIKES, startOfDayTashkent } from "../lib/premium";
import { SwipeAction, Prisma } from "@prisma/client";

const router = Router();

type FullUser = Prisma.UserGetPayload<{
  include: { profile: { include: { photos: true } } };
}>;

/** Build a compact "match list item"-shaped payload for a matched user. */
function miniMatchUser(u: FullUser) {
  const p = u.profile;
  const photo =
    p?.photos.slice().sort((a, b) => a.position - b.position)[0]?.url ?? null;
  return {
    userId: u.id,
    name: p?.name ?? "",
    age: p ? computeAge(p.birthdate) : 0,
    city: p?.city ?? "",
    cityLabel: p ? cityLabel(p.city) : "",
    photo,
  };
}

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

    // Free-tier daily LIKE cap — Premium users have unlimited likes.
    const premium = isPremiumActive(user.premiumUntil);
    if (action === "like" && !premium) {
      // Resets at Tashkent midnight → free users get a fresh 20 likes each day.
      const startOfDay = startOfDayTashkent();
      // Only count NEW likes today (not a re-like of the same person).
      const alreadyLiked = await prisma.swipe.findUnique({
        where: {
          fromUserId_toUserId: { fromUserId: user.id, toUserId: targetUserId },
        },
        select: { action: true },
      });
      if (!alreadyLiked || alreadyLiked.action !== "like") {
        const likesToday = await prisma.swipe.count({
          where: {
            fromUserId: user.id,
            action: "like",
            createdAt: { gte: startOfDay },
          },
        });
        if (likesToday >= FREE_DAILY_LIKES) {
          res
            .status(429)
            .json({ error: "like_limit", limit: FREE_DAILY_LIKES });
          return;
        }
      }
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

        // Notify both users via the bot (fire and forget).
        void notifyNewMatch(user.id);
        void notifyNewMatch(targetUserId);

        // Real-time: push a "new match" event to BOTH users so the celebration
        // appears instantly on both sides — not only for whoever swiped last.
        const [meFull, targetFull] = await Promise.all([
          prisma.user.findUnique({
            where: { id: user.id },
            include: { profile: { include: { photos: true } } },
          }),
          prisma.user.findUnique({
            where: { id: targetUserId },
            include: { profile: { include: { photos: true } } },
          }),
        ]);
        const now = new Date().toISOString();
        if (targetFull) {
          emitToUser(user.id, "match:new", {
            matchId: match.id,
            createdAt: now,
            user: miniMatchUser(targetFull),
            lastMessage: null,
          });
        }
        if (meFull) {
          emitToUser(targetUserId, "match:new", {
            matchId: match.id,
            createdAt: now,
            user: miniMatchUser(meFull),
            lastMessage: null,
          });
        }
      } else if (!reciprocal) {
        // Not a mutual like (and the target hasn't acted on me yet):
        // tell them someone liked their profile (identity kept private).
        void notifyNewLike(targetUserId);
        emitToUser(targetUserId, "like:new", { at: new Date().toISOString() });
      }
    }

    res.json({ ok: true, matched, matchId, remaining: rl.remaining });
  },
);

/**
 * POST /api/swipe/rewind — PREMIUM ONLY.
 * Undoes the user's most recent swipe. If that swipe had created a match, the
 * match (and its messages) is removed too. Returns the rewound person's public
 * profile so the client can re-show the card.
 */
router.post("/rewind", requireAuth, async (req: Request, res: Response) => {
  const user = req.authUser!;

  if (!isPremiumActive(user.premiumUntil)) {
    res.status(403).json({ error: "premium_required" });
    return;
  }

  // Most recent swipe the user made.
  const last = await prisma.swipe.findFirst({
    where: { fromUserId: user.id },
    orderBy: { createdAt: "desc" },
  });
  if (!last) {
    res.status(404).json({ error: "nothing_to_rewind" });
    return;
  }

  // If that like formed a match, drop the match (messages cascade).
  const [a, b] = orderPair(user.id, last.toUserId);
  await prisma.$transaction([
    prisma.match.deleteMany({ where: { userAId: a, userBId: b } }),
    prisma.swipe.delete({ where: { id: last.id } }),
  ]);

  // Return the rewound person's public profile (if still available).
  const target = await prisma.profile.findUnique({
    where: { userId: last.toUserId },
    include: { photos: true, user: { select: { id: true, premiumUntil: true } } },
  });
  const profile =
    target && target.status === "approved"
      ? toPublicProfile(target.user, target, target.photos)
      : null;

  res.json({ ok: true, profile });
});

export default router;
