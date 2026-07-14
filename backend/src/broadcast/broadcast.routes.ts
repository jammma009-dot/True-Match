import { Router, Request, Response } from "express";
import { z } from "zod";
import multer from "multer";
import { City } from "@prisma/client";
import { requireAdmin } from "../middleware/admin";
import { validateBody } from "../middleware/validate";
import { uploadBufferToR2, r2Enabled } from "../lib/r2";
import {
  BroadcastFilters,
  BroadcastMedia,
  countAudience,
  startBroadcast,
  getJob,
  getAutoBroadcastConfig,
  saveAutoBroadcastConfig,
} from "./broadcast.service";

/**
 * ---------------------------------------------------------------------------
 * NEW routes, mounted at /api/broadcast (see backend/src/index.ts).
 *
 *   POST /api/broadcast/count         { filters }              -> { count }
 *   POST /api/broadcast/send          { filters, messages }     -> { jobId, total }
 *   GET  /api/broadcast/status/:jobId                            -> { job }
 *
 * All routes require the same admin password as the rest of /api/admin
 * (via the existing requireAdmin middleware — untouched, just reused).
 * ---------------------------------------------------------------------------
 */

const router = Router();
router.use(requireAdmin);

const filtersSchema = z.object({
  gender: z.enum(["all", "male", "female"]).optional(),
  premium: z.enum(["all", "premium", "free"]).optional(),
  status: z.enum(["all", "pending", "approved", "rejected"]).optional(),
  language: z.enum(["all", "uz", "ru"]).optional(),
  // "all" or one of the City enum values (same pattern as routes/admin.ts editSchema).
  city: z.union([z.literal("all"), z.nativeEnum(City)]).optional(),
  banned: z.enum(["exclude", "only", "all"]).optional(),
  hasProfile: z.enum(["all", "yes", "no"]).optional(),
  // When set, ignore every other filter and target exactly this one user.
  targetUserId: z.string().min(1).optional(),
});
type FiltersInput = z.infer<typeof filtersSchema>;

function toFilters(raw: FiltersInput): BroadcastFilters {
  return {
    gender: raw.gender,
    premium: raw.premium,
    status: raw.status,
    language: raw.language,
    city: raw.city,
    banned: raw.banned ?? "exclude",
    hasProfile: raw.hasProfile,
    targetUserId: raw.targetUserId,
  };
}

const mediaSchema = z.object({
  url: z.string().url(),
  type: z.enum(["photo", "video"]),
});
function toMedia(raw: z.infer<typeof mediaSchema> | undefined): BroadcastMedia | undefined {
  return raw;
}

/** POST /api/broadcast/count { filters } -> { ok, count } */
router.post(
  "/count",
  validateBody(z.object({ filters: filtersSchema.default({}) })),
  async (req: Request, res: Response) => {
    const { filters } = req.body as { filters: FiltersInput };
    const count = await countAudience(toFilters(filters));
    res.json({ ok: true, count });
  },
);

/** POST /api/broadcast/send { filters, messages: { uz?, ru? }, media? } -> { ok, jobId, total } */
const sendSchema = z.object({
  filters: filtersSchema.default({}),
  messages: z
    .object({
      uz: z.string().trim().max(4000).optional(),
      ru: z.string().trim().max(4000).optional(),
    })
    .refine((m) => !!m.uz?.trim() || !!m.ru?.trim(), {
      message: "at least one of messages.uz or messages.ru must be non-empty",
    }),
  media: mediaSchema.optional(),
});
router.post(
  "/send",
  validateBody(sendSchema),
  async (req: Request, res: Response) => {
    const { filters, messages, media } = req.body as z.infer<typeof sendSchema>;
    if (!messages.uz?.trim() && !messages.ru?.trim()) {
      res.status(400).json({ error: "empty_message" });
      return;
    }
    const { jobId, total } = await startBroadcast(
      toFilters(filters),
      messages,
      toMedia(media),
    );
    res.json({ ok: true, jobId, total });
  },
);

/**
 * POST /api/broadcast/media — upload a photo/video to attach to a broadcast
 * (either a one-off "send now" or the autopilot config). multipart/form-data,
 * field name "file". Stored in R2 and referenced by its public URL, which
 * Telegram fetches directly on send (no need to keep the buffer around).
 */
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});
router.post(
  "/media",
  mediaUpload.single("file"),
  async (req: Request, res: Response) => {
    if (!r2Enabled()) {
      res.status(503).json({ error: "storage_not_configured" });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "no_file" });
      return;
    }
    const isVideo = file.mimetype.startsWith("video/");
    const isPhoto = file.mimetype.startsWith("image/");
    if (!isVideo && !isPhoto) {
      res.status(400).json({ error: "unsupported_media_type" });
      return;
    }
    try {
      const uploaded = await uploadBufferToR2("broadcast", file.buffer, file.mimetype);
      res.json({ ok: true, url: uploaded.publicUrl, type: isVideo ? "video" : "photo" });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[broadcast] media upload failed:", err);
      res.status(500).json({ error: "upload_failed" });
    }
  },
);

/** GET /api/broadcast/status/:jobId -> { ok, job } */
router.get("/status/:jobId", (req: Request, res: Response) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "job_not_found" });
    return;
  }
  res.json({ ok: true, job });
});

/**
 * GET /api/broadcast/autopilot -> current autopilot config
 * POST /api/broadcast/autopilot { enabled, hour, filters, messages, media? } -> saved config
 *
 * "Autopilot" sends the configured message automatically once a day at
 * `hour` (0-23, Tashkent time) to the configured audience. A background
 * scheduler (started at server boot — see index.ts) checks this config every
 * minute and fires it at most once per Tashkent day.
 */
router.get("/autopilot", async (_req: Request, res: Response) => {
  const config = await getAutoBroadcastConfig();
  res.json({ ok: true, ...config });
});

const autopilotSchema = z.object({
  enabled: z.boolean(),
  hour: z.coerce.number().int().min(0).max(23),
  filters: filtersSchema.default({}),
  messages: z.object({
    uz: z.string().trim().max(4000).optional(),
    ru: z.string().trim().max(4000).optional(),
  }),
  media: mediaSchema.optional(),
});
router.post(
  "/autopilot",
  validateBody(autopilotSchema),
  async (req: Request, res: Response) => {
    const { enabled, hour, filters, messages, media } = req.body as z.infer<
      typeof autopilotSchema
    >;
    if (enabled && !messages.uz?.trim() && !messages.ru?.trim()) {
      res.status(400).json({ error: "empty_message" });
      return;
    }
    const config = await saveAutoBroadcastConfig({
      enabled,
      hour,
      messages,
      media: toMedia(media),
      filters: toFilters(filters),
    });
    res.json({ ok: true, ...config });
  },
);

export default router;
