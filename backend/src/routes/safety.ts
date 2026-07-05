import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";

const router = Router();

/**
 * POST /api/report — report another user. Stored for moderator review; no
 * automatic action is taken for the MVP.
 */
const reportSchema = z.object({
  reportedUserId: z.string().min(1),
  reason: z.string().trim().min(1).max(100),
  note: z.string().trim().max(1000).optional(),
});

router.post(
  "/report",
  requireAuth,
  validateBody(reportSchema),
  async (req: Request, res: Response) => {
    const user = req.authUser!;
    const { reportedUserId, reason, note } = req.body as z.infer<
      typeof reportSchema
    >;

    if (reportedUserId === user.id) {
      res.status(400).json({ error: "cannot_report_self" });
      return;
    }
    const exists = await prisma.user.findUnique({
      where: { id: reportedUserId },
    });
    if (!exists) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    await prisma.report.create({
      data: {
        reporterId: user.id,
        reportedUserId,
        reason,
        note: note ?? null,
      },
    });

    res.status(201).json({ ok: true });
  },
);

/**
 * POST /api/block — block a user. Hides them from discovery and prevents
 * messaging in both directions.
 */
const blockSchema = z.object({ targetUserId: z.string().min(1) });

router.post(
  "/block",
  requireAuth,
  validateBody(blockSchema),
  async (req: Request, res: Response) => {
    const user = req.authUser!;
    const { targetUserId } = req.body as z.infer<typeof blockSchema>;

    if (targetUserId === user.id) {
      res.status(400).json({ error: "cannot_block_self" });
      return;
    }

    await prisma.block.upsert({
      where: {
        blockerId_blockedId: { blockerId: user.id, blockedId: targetUserId },
      },
      create: { blockerId: user.id, blockedId: targetUserId },
      update: {},
    });

    res.status(201).json({ ok: true });
  },
);

/**
 * POST /api/unblock — remove a block.
 */
router.post(
  "/unblock",
  requireAuth,
  validateBody(blockSchema),
  async (req: Request, res: Response) => {
    const user = req.authUser!;
    const { targetUserId } = req.body as z.infer<typeof blockSchema>;
    await prisma.block.deleteMany({
      where: { blockerId: user.id, blockedId: targetUserId },
    });
    res.json({ ok: true });
  },
);

export default router;
