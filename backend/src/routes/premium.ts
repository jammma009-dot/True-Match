import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { bot } from "../bot";
import { getSettings } from "../lib/settings";
import {
  DEFAULT_PREMIUM_STARS,
  PREMIUM_DAYS,
  DEFAULT_PRESENT_STARS,
  BOOST_DAYS,
} from "../lib/premium";

const router = Router();

/**
 * POST /api/premium/invoice
 * Creates a Telegram Stars invoice link for a Premium purchase and returns it.
 * The Mini App opens it via window.Telegram.WebApp.openInvoice(). Stars are
 * credited to the bot; the successful_payment handler activates Premium.
 */
router.post("/invoice", requireAuth, async (req: Request, res: Response) => {
  const user = req.authUser!;
  const settings = await getSettings();
  const stars = settings.premiumPriceStars ?? DEFAULT_PREMIUM_STARS;

  try {
    const link = await bot.api.createInvoiceLink(
      "True Match Premium",
      `Premium — ${PREMIUM_DAYS} days of unlimited likes, priority, rewind and more.`,
      // Internal payload used by the successful_payment handler.
      `premium:${user.id}`,
      // Empty provider token = payment in Telegram Stars.
      "",
      "XTR",
      [{ label: "True Match Premium", amount: stars }],
    );
    res.json({ link });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[premium] createInvoiceLink failed:", err);
    res.status(500).json({ error: "invoice_failed" });
  }
});

/**
 * POST /api/premium/boost/invoice { targetUserId }
 * Creates a Telegram Stars invoice for a "present" (boost): 3 days on top of
 * the feed. targetUserId may be the buyer (self-boost) or another user (gift).
 * The successful_payment handler applies the boost (stacking) to the target.
 */
const boostSchema = z.object({ targetUserId: z.string().min(1) });
router.post(
  "/boost/invoice",
  requireAuth,
  validateBody(boostSchema),
  async (req: Request, res: Response) => {
    const user = req.authUser!;
    const { targetUserId } = req.body as z.infer<typeof boostSchema>;

    // Target must exist, have an approved profile, and not be banned.
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { profile: { select: { status: true } } },
    });
    if (!target || target.isBanned || target.profile?.status !== "approved") {
      res.status(404).json({ error: "target_unavailable" });
      return;
    }

    const settings = await getSettings();
    const stars = settings.presentPriceStars ?? DEFAULT_PRESENT_STARS;
    const isGift = targetUserId !== user.id;

    try {
      const link = await bot.api.createInvoiceLink(
        isGift ? "True Match Present" : "True Match Boost",
        isGift
          ? `A present for ${target.profile ? "your match" : "a user"} — ${BOOST_DAYS} days on top of the feed.`
          : `Boost — ${BOOST_DAYS} days on top of the feed so more people see you.`,
        // payload: boost:<targetUserId>:<buyerUserId>
        `boost:${targetUserId}:${user.id}`,
        "",
        "XTR",
        [{ label: isGift ? "True Match Present" : "True Match Boost", amount: stars }],
      );
      res.json({ link });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[boost] createInvoiceLink failed:", err);
      res.status(500).json({ error: "invoice_failed" });
    }
  },
);

export default router;
