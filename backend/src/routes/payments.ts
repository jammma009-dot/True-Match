import { Router, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { getSettings } from "../lib/settings";
import { grantPremium, grantBoost } from "../services/entitlements";
import {
  DEFAULT_PRESENT_UZS,
  CARD_ORDER_TTL_MIN,
  buildAmountTiyin,
  formatTiyin,
  resolvePremiumPlans,
  findPremiumPlan,
  PREMIUM_DAYS,
} from "../lib/premium";
import { CardOrderKind } from "@prisma/client";

const router = Router();

/** Fisher–Yates shuffle (returns a new array). */
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Allocate a card order with a UNIQUE last-two-digits (tiyin) suffix so an
 * incoming transfer of the exact amount can be matched back to it. Returns null
 * if no free suffix is available (i.e. 99 concurrent open orders at the same
 * base price — practically never for an MVP).
 */
async function createCardOrder(
  kind: CardOrderKind,
  userId: string,
  targetUserId: string,
  baseUzs: number,
  days?: number,
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CARD_ORDER_TTL_MIN * 60_000);

  // Amounts currently reserved by still-open orders.
  const open = await prisma.cardOrder.findMany({
    where: { status: "pending", expiresAt: { gt: now } },
    select: { amountTiyin: true },
  });
  const taken = new Set(open.map((o) => o.amountTiyin));

  const candidates = shuffle(Array.from({ length: 99 }, (_, i) => i + 1)); // 1..99
  for (const cents of candidates) {
    const amountTiyin = buildAmountTiyin(baseUzs, cents);
    if (taken.has(amountTiyin)) continue;
    return prisma.cardOrder.create({
      data: {
        kind,
        userId,
        targetUserId,
        baseTiyin: baseUzs * 100,
        uniqueCents: cents,
        amountTiyin,
        days,
        expiresAt,
      },
    });
  }
  return null;
}

/** Serialize an order for the client (never leaks internal-only fields). */
function toClientOrder(o: {
  id: string;
  amountTiyin: number;
  status: string;
  expiresAt: Date;
  days?: number | null;
}) {
  return {
    orderId: o.id,
    amount: formatTiyin(o.amountTiyin), // e.g. "1000.17"
    amountTiyin: o.amountTiyin,
    status: o.status,
    expiresAt: o.expiresAt.toISOString(),
    days: o.days ?? null,
  };
}

/**
 * POST /api/payments/card/order  { kind: "premium" | "boost", targetUserId? }
 * Creates a card payment order and returns the card number + the EXACT amount
 * to transfer. The user pays via any bank app; the CardXabar userbot detects
 * the transfer and the webhook below activates the entitlement.
 */
const orderSchema = z.object({
  kind: z.enum(["premium", "boost"]),
  targetUserId: z.string().min(1).optional(),
  days: z.coerce.number().int().min(1).optional(),
});
router.post(
  "/card/order",
  requireAuth,
  validateBody(orderSchema),
  async (req: Request, res: Response) => {
    const user = req.authUser!;
    const { kind, targetUserId, days } = req.body as z.infer<typeof orderSchema>;

    const settings = await getSettings();
    const cardNumber = settings.cardNumber?.trim();
    if (!cardNumber) {
      // Card payments not configured — the client falls back to the manual flow.
      res.status(409).json({ error: "card_unavailable" });
      return;
    }

    let orderKind: CardOrderKind;
    let target: string;
    let baseUzs: number;
    let planDays: number | undefined;

    if (kind === "premium") {
      orderKind = CardOrderKind.premium;
      target = user.id;
      const plan = findPremiumPlan(resolvePremiumPlans(settings), days);
      baseUzs = plan.priceUzs;
      planDays = plan.days;
    } else {
      // Boost or gift.
      target = targetUserId ?? user.id;
      baseUzs = settings.presentPriceUzs ?? DEFAULT_PRESENT_UZS;
      orderKind =
        target !== user.id ? CardOrderKind.gift : CardOrderKind.boost;

      if (target !== user.id) {
        // Gifting: the recipient must exist, be approved and not banned.
        const t = await prisma.user.findUnique({
          where: { id: target },
          include: { profile: { select: { status: true } } },
        });
        if (!t || t.isBanned || t.profile?.status !== "approved") {
          res.status(404).json({ error: "target_unavailable" });
          return;
        }
        // Not to someone blocked (either direction).
        const block = await prisma.block.findFirst({
          where: {
            OR: [
              { blockerId: user.id, blockedId: target },
              { blockerId: target, blockedId: user.id },
            ],
          },
        });
        if (block) {
          res.status(403).json({ error: "blocked" });
          return;
        }
      }
    }

    if (!baseUzs || baseUzs < 1) {
      res.status(409).json({ error: "price_unset" });
      return;
    }

    const order = await createCardOrder(orderKind, user.id, target, baseUzs, planDays);
    if (!order) {
      res.status(503).json({ error: "no_slot_try_again" });
      return;
    }

    res.json({
      ...toClientOrder(order),
      cardNumber,
      cardHolder: settings.cardHolder ?? null,
    });
  },
);

/**
 * GET /api/payments/card/order/:id
 * Poll an order's status. The Mini App calls this every few seconds; once it
 * flips to "paid" the entitlement is already active.
 */
router.get(
  "/card/order/:id",
  requireAuth,
  async (req: Request, res: Response) => {
    const user = req.authUser!;
    const order = await prisma.cardOrder.findUnique({
      where: { id: req.params.id },
    });
    if (!order || order.userId !== user.id) {
      res.status(404).json({ error: "order_not_found" });
      return;
    }
    // Lazily expire.
    if (order.status === "pending" && order.expiresAt.getTime() < Date.now()) {
      await prisma.cardOrder
        .update({ where: { id: order.id }, data: { status: "expired" } })
        .catch(() => undefined);
      order.status = "expired";
    }
    res.json(toClientOrder(order));
  },
);

/**
 * POST /api/payments/cardxabar
 * Called by the OFF-Railway CardXabar userbot when a transfer arrives.
 * Authenticated by the shared secret in the `X-Payment-Secret` header (NOT the
 * Telegram initData auth — this is a server-to-server call).
 *
 * Body: { amountTiyin?: number, amount?: number|string, raw?: string }
 *   - Prefer `amountTiyin` (exact integer tiyin).
 *   - `amount` (so'm, may be "1 000.17" / "1000,17") is accepted as a fallback.
 */
router.post("/cardxabar", async (req: Request, res: Response) => {
  const settings = await getSettings();
  const secret = settings.cardWebhookSecret?.trim();
  if (!secret) {
    res.status(503).json({ error: "webhook_not_configured" });
    return;
  }

  const provided = String(req.header("x-payment-secret") ?? "");
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  // ----- Parse the incoming amount into exact tiyin -----
  const body = req.body ?? {};
  let amountTiyin: number | null = null;
  if (typeof body.amountTiyin === "number" && Number.isFinite(body.amountTiyin)) {
    amountTiyin = Math.round(body.amountTiyin);
  } else if (body.amount != null) {
    const raw =
      typeof body.amount === "string"
        ? body.amount.replace(/\s/g, "").replace(",", ".")
        : String(body.amount);
    const f = parseFloat(raw);
    if (Number.isFinite(f)) amountTiyin = Math.round(f * 100);
  }

  if (amountTiyin == null || amountTiyin <= 0) {
    res.status(400).json({ error: "invalid_amount" });
    return;
  }

  const now = new Date();

  // Find the oldest still-open order matching this exact amount.
  const order = await prisma.cardOrder.findFirst({
    where: {
      status: "pending",
      amountTiyin,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!order) {
    // No match (unknown amount, already paid, or expired). 200 so the userbot
    // doesn't keep retrying — this is a normal, expected outcome.
    res.json({ matched: false });
    return;
  }

  // Mark paid first (idempotency guard against duplicate webhook deliveries).
  await prisma.cardOrder.update({
    where: { id: order.id },
    data: {
      status: "paid",
      paidAt: now,
      matchedRaw: typeof body.raw === "string" ? body.raw.slice(0, 2000) : null,
    },
  });

  // Grant the entitlement (identical to the Stars flow).
  try {
    if (order.kind === CardOrderKind.premium) {
      await grantPremium(order.targetUserId, order.days ?? PREMIUM_DAYS);
    } else {
      // boost (self) or gift — buyer is order.userId, recipient order.targetUserId.
      await grantBoost(order.targetUserId, order.userId);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[payments] entitlement grant failed:", err);
  }

  res.json({ matched: true, kind: order.kind, orderId: order.id });
});

export default router;
