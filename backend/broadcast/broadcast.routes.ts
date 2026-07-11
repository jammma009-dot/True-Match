import { Router, Request, Response } from "express";
import { z } from "zod";
import { City } from "@prisma/client";
import { requireAdmin } from "../middleware/admin";
import { validateBody } from "../middleware/validate";
import {
  BroadcastFilters,
  countAudience,
  startBroadcast,
  getJob,
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
  };
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

/** POST /api/broadcast/send { filters, messages: { uz?, ru? } } -> { ok, jobId, total } */
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
});
router.post(
  "/send",
  validateBody(sendSchema),
  async (req: Request, res: Response) => {
    const { filters, messages } = req.body as z.infer<typeof sendSchema>;
    if (!messages.uz?.trim() && !messages.ru?.trim()) {
      res.status(400).json({ error: "empty_message" });
      return;
    }
    const { jobId, total } = await startBroadcast(toFilters(filters), messages);
    res.json({ ok: true, jobId, total });
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

export default router;
