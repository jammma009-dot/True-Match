import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { bot } from "../bot";
import { getSettings } from "../lib/settings";
import { DEFAULT_PREMIUM_STARS, PREMIUM_DAYS } from "../lib/premium";

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

export default router;
