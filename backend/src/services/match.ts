import { prisma } from "../lib/prisma";
import { emitToUser } from "../socket";
import { computeAge } from "../utils/age";
import { cityLabel } from "../utils/cities";
import { Prisma } from "@prisma/client";

type FullUser = Prisma.UserGetPayload<{
  include: { profile: { include: { photos: true } } };
}>;

/** Compact "match list item"-shaped payload for a matched user. */
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

/**
 * Create (or fetch) the match between two users and push a real-time
 * "match:new" celebration to BOTH. Optionally attach a "gift" first message
 * (highlighted) sent by `gift.fromUserId`.
 *
 * Returns the match id.
 */
export async function createMatchAndCelebrate(
  userId: string,
  otherId: string,
  opts: { gift?: { fromUserId: string } } = {},
): Promise<string> {
  const [userAId, userBId] = orderPair(userId, otherId);
  const match = await prisma.match.upsert({
    where: { userAId_userBId: { userAId, userBId } },
    create: { userAId, userBId },
    update: {},
  });

  let lastMessage: { body: string; senderId: string; createdAt: string } | null =
    null;

  if (opts.gift) {
    const msg = await prisma.message.create({
      data: {
        matchId: match.id,
        senderId: opts.gift.fromUserId,
        body: "🎁",
        isGift: true,
      },
    });
    lastMessage = {
      body: msg.body,
      senderId: msg.senderId,
      createdAt: msg.createdAt.toISOString(),
    };
    const recipientId =
      opts.gift.fromUserId === userId ? otherId : userId;
    emitToUser(recipientId, "message:new", {
      id: msg.id,
      matchId: match.id,
      senderId: msg.senderId,
      body: msg.body,
      isGift: true,
      createdAt: msg.createdAt.toISOString(),
    });
  }

  const [uFull, oFull] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: { profile: { include: { photos: true } } },
    }),
    prisma.user.findUnique({
      where: { id: otherId },
      include: { profile: { include: { photos: true } } },
    }),
  ]);
  const now = new Date().toISOString();
  if (oFull) {
    emitToUser(userId, "match:new", {
      matchId: match.id,
      createdAt: now,
      user: miniMatchUser(oFull),
      lastMessage,
    });
  }
  if (uFull) {
    emitToUser(otherId, "match:new", {
      matchId: match.id,
      createdAt: now,
      user: miniMatchUser(uFull),
      lastMessage,
    });
  }

  return match.id;
}
