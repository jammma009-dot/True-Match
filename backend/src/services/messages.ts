import { prisma } from "../lib/prisma";

export interface CreateMessageResult {
  ok: boolean;
  error?: string;
  message?: {
    id: string;
    matchId: string;
    senderId: string;
    body: string;
    isGift: boolean;
    createdAt: string;
  };
  recipientId?: string;
}

/**
 * Persist a chat message after verifying:
 *  - the match exists and the sender is part of it
 *  - neither user has blocked the other
 * Returns the created message plus the recipient's user id (for notifications).
 */
export async function createMessage(
  matchId: string,
  senderId: string,
  bodyRaw: string,
): Promise<CreateMessageResult> {
  const body = bodyRaw.trim();
  if (!body) return { ok: false, error: "empty_message" };
  if (body.length > 2000) return { ok: false, error: "message_too_long" };

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return { ok: false, error: "match_not_found" };

  if (match.userAId !== senderId && match.userBId !== senderId) {
    return { ok: false, error: "not_a_participant" };
  }

  const recipientId =
    match.userAId === senderId ? match.userBId : match.userAId;

  // Block check (either direction).
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: senderId, blockedId: recipientId },
        { blockerId: recipientId, blockedId: senderId },
      ],
    },
  });
  if (block) return { ok: false, error: "blocked" };

  const msg = await prisma.message.create({
    data: { matchId, senderId, body },
  });

  return {
    ok: true,
    recipientId,
    message: {
      id: msg.id,
      matchId: msg.matchId,
      senderId: msg.senderId,
      body: msg.body,
      isGift: msg.isGift,
      createdAt: msg.createdAt.toISOString(),
    },
  };
}
