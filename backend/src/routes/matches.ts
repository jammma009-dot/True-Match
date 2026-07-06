import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { computeAge } from "../utils/age";
import { cityLabel } from "../utils/cities";
import { toPublicProfile } from "../utils/serialize";
import { createMessage } from "../services/messages";
import { notifyNewMessage } from "../bot/notify";
import { emitToUser, isUserViewingChat } from "../socket";
import { isPremiumActive } from "../lib/premium";

const router = Router();

/**
 * GET /api/matches
 * List the current user's matches with the other person's basic profile and
 * a preview of the last message.
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const user = req.authUser!;
  // Premium perk: reveal the matched person's Telegram @username so they can
  // jump straight into a Telegram chat.
  const requesterPremium = isPremiumActive(user.premiumUntil);

  const matches = await prisma.match.findMany({
    where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
    orderBy: { createdAt: "desc" },
  });

  const result = await Promise.all(
    matches.map(async (m) => {
      const otherId = m.userAId === user.id ? m.userBId : m.userAId;
      const other = await prisma.user.findUnique({
        where: { id: otherId },
        include: { profile: { include: { photos: true } } },
      });
      const lastMessage = await prisma.message.findFirst({
        where: { matchId: m.id },
        orderBy: { createdAt: "desc" },
      });
      const unread = await prisma.message.count({
        where: { matchId: m.id, senderId: { not: user.id }, readAt: null },
      });

      const profile = other?.profile;
      const firstPhoto = profile?.photos.sort(
        (a, b) => a.position - b.position,
      )[0];

      return {
        matchId: m.id,
        createdAt: m.createdAt.toISOString(),
        user: profile
          ? {
              userId: otherId,
              name: profile.name,
              age: computeAge(profile.birthdate),
              city: profile.city,
              cityLabel: cityLabel(profile.city),
              photo: firstPhoto?.url ?? null,
              // Premium status is public so premium users stand out everywhere.
              isPremium: isPremiumActive(other?.premiumUntil ?? null),
              verified: profile.verificationStatus === "verified",
              // Only exposed to Premium requesters (and only if they have one).
              telegramUsername: requesterPremium ? other?.username ?? null : null,
            }
          : null,
        lastMessage: lastMessage
          ? {
              body: lastMessage.body,
              senderId: lastMessage.senderId,
              createdAt: lastMessage.createdAt.toISOString(),
            }
          : null,
        unread,
        seen: m.userAId === user.id ? m.seenA : m.seenB,
      };
    }),
  );

  res.json({ matches: result });
});

/**
 * POST /api/matches/:matchId/seen — mark the "new match" celebration as seen
 * for the current user (so it doesn't pop again on next open).
 */
router.post("/:matchId/seen", requireAuth, async (req: Request, res: Response) => {
  const user = req.authUser!;
  const match = await getMemberMatch(req.params.matchId, user.id);
  if (!match) {
    res.status(404).json({ error: "match_not_found" });
    return;
  }
  await prisma.match.update({
    where: { id: match.id },
    data: match.userAId === user.id ? { seenA: true } : { seenB: true },
  });
  res.json({ ok: true });
});

/**
 * GET /api/matches/:matchId/profile — full public profile of the matched
 * person (for the "View profile" screen opened from the chat).
 */
router.get("/:matchId/profile", requireAuth, async (req: Request, res: Response) => {
  const user = req.authUser!;
  const match = await getMemberMatch(req.params.matchId, user.id);
  if (!match) {
    res.status(404).json({ error: "match_not_found" });
    return;
  }
  const otherId = match.userAId === user.id ? match.userBId : match.userAId;
  const other = await prisma.user.findUnique({
    where: { id: otherId },
    include: { profile: { include: { photos: true } } },
  });
  if (!other || !other.profile) {
    res.status(404).json({ error: "profile_not_found" });
    return;
  }
  res.json({ profile: toPublicProfile(other, other.profile, other.profile.photos) });
});

/**
 * POST /api/matches/:matchId/read — mark all messages from the other person as
 * read (used when the chat is open / a message arrives while viewing).
 */
router.post("/:matchId/read", requireAuth, async (req: Request, res: Response) => {
  const user = req.authUser!;
  const match = await getMemberMatch(req.params.matchId, user.id);
  if (!match) {
    res.status(404).json({ error: "match_not_found" });
    return;
  }
  await prisma.message.updateMany({
    where: { matchId: match.id, senderId: { not: user.id }, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
});

/** Verify the current user belongs to the match; returns match or null. */
async function getMemberMatch(matchId: string, userId: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return null;
  if (match.userAId !== userId && match.userBId !== userId) return null;
  return match;
}

/**
 * GET /api/matches/:matchId/messages — chat history (oldest first).
 */
router.get(
  "/:matchId/messages",
  requireAuth,
  async (req: Request, res: Response) => {
    const user = req.authUser!;
    const match = await getMemberMatch(req.params.matchId, user.id);
    if (!match) {
      res.status(404).json({ error: "match_not_found" });
      return;
    }

    const messages = await prisma.message.findMany({
      where: { matchId: match.id },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    // Mark received messages as read.
    await prisma.message.updateMany({
      where: { matchId: match.id, senderId: { not: user.id }, readAt: null },
      data: { readAt: new Date() },
    });

    res.json({
      messages: messages.map((m) => ({
        id: m.id,
        matchId: m.matchId,
        senderId: m.senderId,
        body: m.body,
        isGift: m.isGift,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  },
);

/**
 * POST /api/matches/:matchId/messages — REST fallback for sending a message.
 * (Real-time delivery normally happens over Socket.io, but this endpoint keeps
 * the API usable/testable without a socket connection.)
 */
const sendSchema = z.object({ body: z.string().min(1).max(2000) });
router.post(
  "/:matchId/messages",
  requireAuth,
  validateBody(sendSchema),
  async (req: Request, res: Response) => {
    const user = req.authUser!;
    const { body } = req.body as z.infer<typeof sendSchema>;

    const result = await createMessage(req.params.matchId, user.id, body);
    if (!result.ok || !result.message) {
      res.status(400).json({ error: result.error ?? "send_failed" });
      return;
    }

    // Real-time push to the recipient if connected.
    emitToUser(result.recipientId!, "message:new", result.message);

    // Bot notification unless the recipient is actively viewing this chat.
    if (!isUserViewingChat(result.recipientId!, req.params.matchId)) {
      void notifyNewMessage(result.recipientId!);
    }

    res.status(201).json({ message: result.message });
  },
);

export default router;
