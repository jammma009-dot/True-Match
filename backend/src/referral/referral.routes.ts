import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { getReferralSummary } from "./referral.service";

/**
 * NEW route, mounted at /api/referral (see backend/src/index.ts).
 *
 *   GET /api/referral/summary -> { link, approvedCount, pendingCount }
 *
 * Uses the same requireAuth middleware as every other user-facing route
 * (backend/src/middleware/auth.ts) — untouched, just reused.
 */
const router = Router();
router.use(requireAuth);

router.get("/summary", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const summary = await getReferralSummary(user.id, user.telegramId);
  res.json(summary);
});

export default router;
