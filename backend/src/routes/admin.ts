import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin } from "../middleware/admin";
import { validateBody } from "../middleware/validate";
import { computeAge } from "../utils/age";
import { cityLabel } from "../utils/cities";
import { notifyApproved, notifyRejected } from "../bot/notify";

const router = Router();

// All admin routes require the admin password.
router.use(requireAdmin);

/**
 * GET /api/admin/pending — pending profiles queue.
 */
router.get("/pending", async (_req: Request, res: Response) => {
  const profiles = await prisma.profile.findMany({
    where: { status: "pending" },
    include: { photos: true, user: { select: { id: true } } },
    orderBy: { createdAt: "asc" },
  });

  res.json({
    profiles: profiles.map((p) => ({
      userId: p.userId,
      name: p.name,
      age: computeAge(p.birthdate),
      gender: p.gender,
      intent: p.intent,
      city: p.city,
      cityLabel: cityLabel(p.city),
      photos: p.photos
        .sort((a, b) => a.position - b.position)
        .map((ph) => ph.url),
      createdAt: p.createdAt.toISOString(),
    })),
  });
});

/**
 * POST /api/admin/profiles/:userId/approve
 * Approves the profile and locks the gender (immutable afterwards).
 */
router.post(
  "/profiles/:userId/approve",
  async (req: Request, res: Response) => {
    const { userId } = req.params;
    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile) {
      res.status(404).json({ error: "profile_not_found" });
      return;
    }
    await prisma.profile.update({
      where: { userId },
      data: { status: "approved", genderLocked: true, rejectionReason: null },
    });
    void notifyApproved(userId);
    res.json({ ok: true });
  },
);

/**
 * POST /api/admin/profiles/:userId/reject { reason? }
 */
const rejectSchema = z.object({ reason: z.string().trim().max(300).optional() });
router.post(
  "/profiles/:userId/reject",
  validateBody(rejectSchema),
  async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { reason } = req.body as z.infer<typeof rejectSchema>;
    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile) {
      res.status(404).json({ error: "profile_not_found" });
      return;
    }
    await prisma.profile.update({
      where: { userId },
      data: { status: "rejected", rejectionReason: reason ?? null },
    });
    void notifyRejected(userId);
    res.json({ ok: true });
  },
);

/**
 * GET /api/admin/reports — open reports queue with reported users' photos.
 */
router.get("/reports", async (_req: Request, res: Response) => {
  const reports = await prisma.report.findMany({
    where: { resolved: false },
    orderBy: { createdAt: "desc" },
    include: {
      reportedUser: {
        include: { profile: { include: { photos: true } } },
      },
    },
  });

  res.json({
    reports: reports.map((r) => ({
      id: r.id,
      reason: r.reason,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      reportedUser: {
        userId: r.reportedUserId,
        isBanned: r.reportedUser.isBanned,
        name: r.reportedUser.profile?.name ?? null,
        photos:
          r.reportedUser.profile?.photos
            .sort((a, b) => a.position - b.position)
            .map((ph) => ph.url) ?? [],
      },
    })),
  });
});

/**
 * POST /api/admin/users/:userId/ban — deactivate an account. Resolves any
 * open reports against them.
 */
router.post("/users/:userId/ban", async (req: Request, res: Response) => {
  const { userId } = req.params;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ error: "user_not_found" });
    return;
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { isBanned: true } }),
    prisma.report.updateMany({
      where: { reportedUserId: userId },
      data: { resolved: true },
    }),
  ]);
  res.json({ ok: true });
});

/**
 * POST /api/admin/reports/:id/dismiss — mark a report resolved without banning.
 */
router.post("/reports/:id/dismiss", async (req: Request, res: Response) => {
  await prisma.report.update({
    where: { id: req.params.id },
    data: { resolved: true },
  });
  res.json({ ok: true });
});

export default router;
