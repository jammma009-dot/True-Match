import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createPresignedUpload, r2Enabled } from "../lib/r2";

const router = Router();

/**
 * POST /api/photos/presign
 * Returns a presigned R2 PUT URL so the frontend can upload a photo directly
 * to R2. The file bytes never touch this server.
 *
 * Flow per slot:
 *   1. POST /photos/presign { contentType } -> { key, uploadUrl, publicUrl }
 *   2. Frontend PUTs the file bytes to uploadUrl
 *   3. Frontend includes { key, url: publicUrl } in the profile submit payload
 */
const presignSchema = z.object({
  contentType: z
    .string()
    .refine(
      (v) => ["image/jpeg", "image/png", "image/webp"].includes(v),
      "Unsupported image type",
    ),
});

router.post(
  "/presign",
  requireAuth,
  validateBody(presignSchema),
  async (req: Request, res: Response) => {
    if (!r2Enabled()) {
      res.status(503).json({ error: "storage_not_configured" });
      return;
    }
    const user = req.authUser!;
    const { contentType } = req.body as z.infer<typeof presignSchema>;
    try {
      const upload = await createPresignedUpload(user.id, contentType);
      res.json(upload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[photos] presign error:", err);
      res.status(500).json({ error: "presign_failed" });
    }
  },
);

export default router;
