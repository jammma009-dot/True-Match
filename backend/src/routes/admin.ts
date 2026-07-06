import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin } from "../middleware/admin";
import { validateBody } from "../middleware/validate";
import { computeAge, isAdult, MIN_AGE } from "../utils/age";
import { cityLabel } from "../utils/cities";
import { notifyApproved, notifyRejected } from "../bot/notify";
import { createSampleProfiles, removeSampleProfiles } from "../services/sampleData";
import { getSettings } from "../lib/settings";
import { DEFAULT_PREMIUM_STARS, isPremiumActive } from "../lib/premium";
import { Gender, Intent, City, ProfileStatus, Prisma } from "@prisma/client";

const router = Router();

// All admin routes require the admin password.
router.use(requireAdmin);

/**
 * GET /api/admin/settings — read app settings.
 * POST /api/admin/settings — update contact/payment usernames.
 */
router.get("/settings", async (_req: Request, res: Response) => {
  const s = await getSettings();
  res.json({
    contactUsername: s.contactUsername,
    paymentUsername: s.paymentUsername,
    premiumPriceStars: s.premiumPriceStars ?? DEFAULT_PREMIUM_STARS,
    starRecipient: s.starRecipient,
  });
});

const settingsSchema = z.object({
  contactUsername: z.string().trim().max(64).optional(),
  paymentUsername: z.string().trim().max(64).optional(),
  premiumPriceStars: z.coerce.number().int().min(1).max(100000).optional(),
  starRecipient: z.string().trim().max(64).optional(),
});
router.post(
  "/settings",
  validateBody(settingsSchema),
  async (req: Request, res: Response) => {
    const data = req.body as z.infer<typeof settingsSchema>;
    // Strip a leading @ if the admin includes it.
    const clean = (v?: string) => (v ? v.replace(/^@/, "").trim() || null : null);
    const common = {
      contactUsername: clean(data.contactUsername),
      paymentUsername: clean(data.paymentUsername),
      premiumPriceStars: data.premiumPriceStars ?? null,
      starRecipient: clean(data.starRecipient),
    };
    const s = await prisma.settings.upsert({
      where: { id: 1 },
      update: common,
      create: { id: 1, ...common },
    });
    res.json({
      ok: true,
      contactUsername: s.contactUsername,
      paymentUsername: s.paymentUsername,
      premiumPriceStars: s.premiumPriceStars ?? DEFAULT_PREMIUM_STARS,
      starRecipient: s.starRecipient,
    });
  },
);

/**
 * POST /api/admin/seed — load ~12 sample/test profiles into the feed.
 * Idempotent. Handy for testing the discovery/swipe screen without real users.
 */
router.post("/seed", async (_req: Request, res: Response) => {
  const count = await createSampleProfiles();
  res.json({ ok: true, count });
});

/**
 * POST /api/admin/seed/remove — delete all sample/test profiles.
 */
router.post("/seed/remove", async (_req: Request, res: Response) => {
  const count = await removeSampleProfiles();
  res.json({ ok: true, removed: count });
});

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

// ---------- User management ----------

/**
 * GET /api/admin/users?q=&status=  — list all users with their profile summary.
 * Supports optional name search (?q=) and status filter (?status=).
 */
router.get("/users", async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;

  // Build a single nested `profile` filter so search + status combine correctly.
  const profileFilter: Prisma.ProfileWhereInput = {};
  if (q) profileFilter.name = { contains: q, mode: "insensitive" };
  if (status && ["pending", "approved", "rejected"].includes(status)) {
    profileFilter.status = status as ProfileStatus;
  }

  const users = await prisma.user.findMany({
    where:
      Object.keys(profileFilter).length > 0
        ? { profile: profileFilter }
        : {},
    include: { profile: { include: { photos: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  res.json({
    users: users.map((u) => ({
      userId: u.id,
      telegramId: u.telegramId.toString(),
      language: u.language,
      isBanned: u.isBanned,
      isPremium: isPremiumActive(u.premiumUntil),
      premiumUntil: u.premiumUntil ? u.premiumUntil.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
      profile: u.profile
        ? {
            name: u.profile.name,
            age: computeAge(u.profile.birthdate),
            birthdate: u.profile.birthdate.toISOString().slice(0, 10),
            gender: u.profile.gender,
            intent: u.profile.intent,
            city: u.profile.city,
            cityLabel: cityLabel(u.profile.city),
            status: u.profile.status,
            photos: u.profile.photos
              .sort((a, b) => a.position - b.position)
              .map((ph) => ph.url),
          }
        : null,
    })),
  });
});

/**
 * PATCH /api/admin/users/:userId — edit a user's profile fields.
 * Admin can override anything (including gender, even after approval).
 */
const editSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  birthdate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "birthdate must be YYYY-MM-DD")
    .optional(),
  gender: z.nativeEnum(Gender).optional(),
  intent: z.nativeEnum(Intent).optional(),
  city: z.nativeEnum(City).optional(),
  status: z.nativeEnum(ProfileStatus).optional(),
  rejectionReason: z.string().trim().max(300).optional(),
});

router.patch(
  "/users/:userId",
  validateBody(editSchema),
  async (req: Request, res: Response) => {
    const { userId } = req.params;
    const data = req.body as z.infer<typeof editSchema>;

    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile) {
      res.status(404).json({ error: "profile_not_found" });
      return;
    }

    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.gender !== undefined) update.gender = data.gender;
    if (data.intent !== undefined) update.intent = data.intent;
    if (data.city !== undefined) update.city = data.city;

    if (data.birthdate !== undefined) {
      const bd = new Date(`${data.birthdate}T00:00:00.000Z`);
      if (isNaN(bd.getTime())) {
        res.status(400).json({ error: "invalid_birthdate" });
        return;
      }
      if (!isAdult(bd)) {
        res.status(400).json({ error: "underage", minAge: MIN_AGE });
        return;
      }
      update.birthdate = bd;
    }

    let notify: null | "approved" | "rejected" = null;
    if (data.status !== undefined && data.status !== profile.status) {
      update.status = data.status;
      if (data.status === "approved") {
        update.genderLocked = true;
        update.rejectionReason = null;
        notify = "approved";
      } else if (data.status === "rejected") {
        update.rejectionReason = data.rejectionReason ?? null;
        notify = "rejected";
      }
    } else if (data.rejectionReason !== undefined) {
      update.rejectionReason = data.rejectionReason;
    }

    await prisma.profile.update({ where: { userId }, data: update });

    if (notify === "approved") void notifyApproved(userId);
    if (notify === "rejected") void notifyRejected(userId);

    res.json({ ok: true });
  },
);

/**
 * POST /api/admin/users/:userId/premium { days }
 * Manually grant Premium (e.g. after a card payment). days=0 revokes it.
 */
const premiumSchema = z.object({
  days: z.coerce.number().int().min(0).max(3650),
});
router.post(
  "/users/:userId/premium",
  validateBody(premiumSchema),
  async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { days } = req.body as z.infer<typeof premiumSchema>;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }
    const premiumUntil =
      days > 0 ? new Date(Date.now() + days * 86_400_000) : null;
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { premiumUntil },
    });
    res.json({
      ok: true,
      isPremium: isPremiumActive(updated.premiumUntil),
      premiumUntil: updated.premiumUntil
        ? updated.premiumUntil.toISOString()
        : null,
    });
  },
);

/**
 * POST /api/admin/users/:userId/unban — reactivate a banned account.
 */
router.post("/users/:userId/unban", async (req: Request, res: Response) => {
  const { userId } = req.params;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ error: "user_not_found" });
    return;
  }
  await prisma.user.update({ where: { id: userId }, data: { isBanned: false } });
  res.json({ ok: true });
});

/**
 * DELETE /api/admin/users/:userId — permanently delete a user and all their
 * data (profile, photos, swipes, matches, messages, reports, blocks cascade).
 */
router.delete("/users/:userId", async (req: Request, res: Response) => {
  const { userId } = req.params;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ error: "user_not_found" });
    return;
  }
  await prisma.user.delete({ where: { id: userId } });
  res.json({ ok: true });
});

export default router;
