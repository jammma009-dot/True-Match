import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin } from "../middleware/admin";
import { validateBody } from "../middleware/validate";
import { computeAge, isAdult, MIN_AGE } from "../utils/age";
import { cityLabel } from "../utils/cities";
import { notifyApproved, notifyRejected, notifyPremiumGranted, notifyBoostGranted, notifyVerified } from "../bot/notify";
import { rewardReferrerIfEligible } from "../referral/referral.service"; // NEW: referral program
import { getSettings } from "../lib/settings";
import {
  isPremiumActive,
  DEFAULT_PRESENT_STARS,
  isBoostActive,
  DEFAULT_PRESENT_UZS,
  formatTiyin,
  resolvePremiumPlans,
  MAX_PREMIUM_PLANS,
} from "../lib/premium";
import multer from "multer";
import { r2Enabled, uploadBufferToR2 } from "../lib/r2";
import {
  Gender,
  Intent,
  City,
  ProfileStatus,
  CardOrderStatus,
  Prisma,
} from "@prisma/client";

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
    presentPriceStars: s.presentPriceStars ?? DEFAULT_PRESENT_STARS,
    starRecipient: s.starRecipient,
    cardNumber: s.cardNumber,
    cardHolder: s.cardHolder,
    presentPriceUzs: s.presentPriceUzs ?? DEFAULT_PRESENT_UZS,
    cardWebhookSecret: s.cardWebhookSecret,
    // Up to 4 selectable Premium plans (period + Stars/UZS price). Always
    // resolved (falls back to the legacy single price as one plan).
    premiumPlans: resolvePremiumPlans(s),
  });
});

const premiumPlanSchema = z.object({
  days: z.coerce.number().int().min(1).max(3650),
  priceStars: z.coerce.number().int().min(1).max(100000),
  priceUzs: z.coerce.number().int().min(1).max(100_000_000),
  label: z.string().trim().max(60).optional(),
});
const settingsSchema = z.object({
  contactUsername: z.string().trim().max(64).optional(),
  paymentUsername: z.string().trim().max(64).optional(),
  presentPriceStars: z.coerce.number().int().min(1).max(100000).optional(),
  starRecipient: z.string().trim().max(64).optional(),
  cardNumber: z.string().trim().max(64).optional(),
  cardHolder: z.string().trim().max(120).optional(),
  presentPriceUzs: z.coerce.number().int().min(1).max(100_000_000).optional(),
  cardWebhookSecret: z.string().trim().max(200).optional(),
  premiumPlans: z.array(premiumPlanSchema).max(MAX_PREMIUM_PLANS).optional(),
});
router.post(
  "/settings",
  validateBody(settingsSchema),
  async (req: Request, res: Response) => {
    const data = req.body as z.infer<typeof settingsSchema>;
    const clean = (v?: string) => (v ? v.replace(/^@/, "").trim() || null : null);
    const text = (v?: string) => (v != null && v.trim() !== "" ? v.trim() : null);
    const common = {
      contactUsername: clean(data.contactUsername),
      paymentUsername: clean(data.paymentUsername),
      presentPriceStars: data.presentPriceStars ?? null,
      starRecipient: clean(data.starRecipient),
      cardNumber: text(data.cardNumber),
      cardHolder: text(data.cardHolder),
      presentPriceUzs: data.presentPriceUzs ?? null,
      cardWebhookSecret: text(data.cardWebhookSecret),
      ...(data.premiumPlans !== undefined
        ? { premiumPlans: data.premiumPlans as unknown as Prisma.InputJsonValue }
        : {}),
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
      presentPriceStars: s.presentPriceStars ?? DEFAULT_PRESENT_STARS,
      starRecipient: s.starRecipient,
      cardNumber: s.cardNumber,
      cardHolder: s.cardHolder,
      presentPriceUzs: s.presentPriceUzs ?? DEFAULT_PRESENT_UZS,
      cardWebhookSecret: s.cardWebhookSecret,
      premiumPlans: resolvePremiumPlans(s),
    });
  },
);

/**
 * GET /api/admin/card-orders?status= — recent card payment orders for
 * reconciliation, newest first (max 200). Includes a summary (counts by status
 * + total received) and resolves buyer/recipient names for readability.
 */
router.get("/card-orders", async (req: Request, res: Response) => {
  const raw = typeof req.query.status === "string" ? req.query.status : "";
  const statusFilter = (["pending", "paid", "expired", "cancelled"] as const).includes(
    raw as CardOrderStatus,
  )
    ? (raw as CardOrderStatus)
    : undefined;

  const orders = await prisma.cardOrder.findMany({
    where: statusFilter ? { status: statusFilter } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Resolve buyer + recipient names in a single batched query.
  const userIds = Array.from(
    new Set(orders.flatMap((o) => [o.userId, o.targetUserId])),
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        include: { profile: { select: { name: true } } },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u] as const));

  const [statusCounts, paidAgg] = await Promise.all([
    prisma.cardOrder.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.cardOrder.aggregate({
      where: { status: "paid" },
      _sum: { amountTiyin: true },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const s of statusCounts) counts[s.status] = s._count._all;

  res.json({
    summary: {
      counts,
      totalReceived: formatTiyin(paidAgg._sum.amountTiyin ?? 0),
    },
    orders: orders.map((o) => {
      const buyer = byId.get(o.userId);
      const isGift = o.targetUserId !== o.userId;
      const recipient = isGift ? byId.get(o.targetUserId) : undefined;
      return {
        id: o.id,
        kind: o.kind,
        amount: formatTiyin(o.amountTiyin),
        status: o.status,
        buyerName: buyer?.profile?.name ?? null,
        buyerTelegramId: buyer?.telegramId ? buyer.telegramId.toString() : null,
        recipientName: isGift ? recipient?.profile?.name ?? null : null,
        createdAt: o.createdAt.toISOString(),
        paidAt: o.paidAt ? o.paidAt.toISOString() : null,
      };
    }),
  });
});

/**
 * POST /api/admin/users/manual
 * Create ONE user + approved profile from the admin panel, with photos the
 * admin uploads directly (multipart/form-data). Replaces the old bulk
 * "load/remove sample profiles" testing tool — the admin now builds each
 * profile by hand, one at a time, with real photos.
 *
 * Uses a synthetic negative telegramId (like the old sample data) so it never
 * collides with a real Telegram user. Fields mirror the normal profile model;
 * only name/birthdate/gender/intent/city are required.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
});

async function nextManualTelegramId(): Promise<bigint> {
  // Manual/admin-created profiles live in the same negative-id range as the
  // old sample data, but counting down from -900000 so they never collide
  // with anything that may still exist from -1..-100000.
  const lowest = await prisma.user.findFirst({
    where: { telegramId: { lt: BigInt(-900000) } },
    orderBy: { telegramId: "asc" },
    select: { telegramId: true },
  });
  return lowest ? lowest.telegramId - BigInt(1) : BigInt(-900001);
}

router.post(
  "/users/manual",
  upload.array("photos", 6),
  async (req: Request, res: Response) => {
    if (!r2Enabled()) {
      res.status(503).json({ error: "storage_not_configured" });
      return;
    }
    const body = req.body as Record<string, string>;
    const manualSchema = z.object({
      name: z.string().trim().min(1).max(50),
      age: z.coerce.number().int().min(18).max(90),
      gender: z.nativeEnum(Gender),
      intent: z.nativeEnum(Intent),
      city: z.nativeEnum(City),
      bio: z.string().trim().max(500).optional(),
      heightCm: z.coerce.number().int().min(120).max(230).optional(),
      smoking: z.enum(["never", "sometimes", "often"]).optional(),
      drinking: z.enum(["never", "sometimes", "often"]).optional(),
      interests: z.string().optional(), // comma-separated
    });
    const parsed = manualSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      res.status(400).json({ error: "at_least_one_photo_required" });
      return;
    }

    const telegramId = await nextManualTelegramId();
    const user = await prisma.user.create({
      data: { telegramId, language: "uz" },
    });

    const birthdate = (() => {
      const now = new Date();
      return new Date(now.getFullYear() - data.age, now.getMonth(), now.getDate());
    })();

    const profile = await prisma.profile.create({
      data: {
        userId: user.id,
        name: data.name,
        birthdate,
        gender: data.gender,
        intent: data.intent,
        city: data.city,
        status: "approved",
        genderLocked: true,
        bio: data.bio || null,
        heightCm: data.heightCm ?? null,
        smoking: data.smoking ?? null,
        drinking: data.drinking ?? null,
        interests: data.interests
          ? data.interests.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
      },
    });

    try {
      let position = 0;
      for (const file of files) {
        const uploaded = await uploadBufferToR2(
          user.id,
          file.buffer,
          file.mimetype,
        );
        await prisma.photo.create({
          data: {
            profileId: profile.id,
            key: uploaded.key,
            url: uploaded.publicUrl,
            position: position++,
          },
        });
      }
    } catch (err) {
      // Roll back the just-created user (cascades to profile/photos) so we
      // don't leave a half-created profile behind.
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      // eslint-disable-next-line no-console
      console.error("[admin] manual user photo upload failed:", err);
      res.status(500).json({ error: "photo_upload_failed" });
      return;
    }

    res.json({ ok: true, userId: user.id });
  },
);

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
    void rewardReferrerIfEligible(userId); // NEW: referral program
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
      isBoosted: isBoostActive(u.boostUntil),
      boostUntil: u.boostUntil ? u.boostUntil.toISOString() : null,
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

    if (notify === "approved") {
      void notifyApproved(userId);
      void rewardReferrerIfEligible(userId); // NEW: referral program
    }
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
    // Tell the user via the bot when Premium is granted.
    if (days > 0) void notifyPremiumGranted(userId);
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
 * GET /api/admin/verifications — profiles awaiting photo verification, with
 * their verification selfie + profile photos for comparison.
 */
router.get("/verifications", async (_req: Request, res: Response) => {
  const profiles = await prisma.profile.findMany({
    where: { verificationStatus: "pending" },
    include: { photos: true },
    orderBy: { updatedAt: "asc" },
  });
  res.json({
    verifications: profiles.map((p) => ({
      userId: p.userId,
      name: p.name,
      age: computeAge(p.birthdate),
      verificationPhotoUrl: p.verificationPhotoUrl,
      photos: p.photos
        .sort((a, b) => a.position - b.position)
        .map((ph) => ph.url),
    })),
  });
});

/**
 * POST /api/admin/users/:userId/verify { approve }
 * Approve or reject a pending photo verification.
 */
const verifyDecisionSchema = z.object({ approve: z.boolean() });
router.post(
  "/users/:userId/verify",
  validateBody(verifyDecisionSchema),
  async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { approve } = req.body as z.infer<typeof verifyDecisionSchema>;
    const profile = await prisma.profile.findUnique({ where: { userId } });
    if (!profile) {
      res.status(404).json({ error: "profile_not_found" });
      return;
    }
    await prisma.profile.update({
      where: { userId },
      data: { verificationStatus: approve ? "verified" : "rejected" },
    });
    if (approve) void notifyVerified(userId);
    res.json({ ok: true });
  },
);

/**
 * POST /api/admin/users/:userId/boost { days }
 * Manually grant a Boost/Present (e.g. after a card payment). Sets boostUntil
 * to now + days. days=0 clears it.
 */
const boostSchema = z.object({
  days: z.coerce.number().int().min(0).max(3650),
});
router.post(
  "/users/:userId/boost",
  validateBody(boostSchema),
  async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { days } = req.body as z.infer<typeof boostSchema>;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }
    const boostUntil = days > 0 ? new Date(Date.now() + days * 86_400_000) : null;
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { boostUntil },
    });
    if (days > 0) void notifyBoostGranted(userId);
    res.json({
      ok: true,
      isBoosted: isBoostActive(updated.boostUntil),
      boostUntil: updated.boostUntil ? updated.boostUntil.toISOString() : null,
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
