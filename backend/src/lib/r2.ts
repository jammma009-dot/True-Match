import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { env } from "../config/env";

/**
 * Cloudflare R2 is S3-compatible. We use the AWS SDK v3 with R2's endpoint.
 * The frontend uploads photos DIRECTLY to R2 using presigned PUT URLs that
 * this backend generates — the file bytes never pass through our server.
 */
const r2Configured = Boolean(
  env.R2_ACCOUNT_ID &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_BUCKET,
);

export const r2Enabled = (): boolean => r2Configured;

/**
 * Whether a photo/verification URL is one we actually issued (i.e. lives under
 * our R2 public base). The client sends back the `url` from a presign response,
 * but nothing stops a malicious client from sending an arbitrary URL — which
 * would then be rendered in other users' feeds and the admin panel. Restricting
 * to our own bucket closes that (a source of stored-XSS / content injection).
 *
 * When no public base is configured (local dev), we only require a plain https
 * URL so the flow still works.
 */
export function isAllowedPhotoUrl(url: string): boolean {
  if (typeof url !== "string" || url.length > 2048) return false;
  const base = env.R2_PUBLIC_BASE_URL.replace(/\/$/, "");
  if (!base) return /^https:\/\/[^\s"'<>]+$/i.test(url);
  return url.startsWith(base + "/") && !/[\s"'<>]/.test(url);
}

const s3 = r2Configured
  ? new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  publicUrl: string;
}

/**
 * Create a presigned PUT URL for a single photo upload.
 * @param userId used to namespace the object key
 * @param contentType e.g. "image/jpeg"
 */
export async function createPresignedUpload(
  userId: string,
  contentType: string,
): Promise<PresignedUpload> {
  if (!s3) {
    throw new Error("R2 is not configured");
  }

  const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const key = `photos/${userId}/${randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  // URL valid for 5 minutes — enough for a single upload.
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  const base = env.R2_PUBLIC_BASE_URL.replace(/\/$/, "");
  const publicUrl = `${base}/${key}`;

  return { key, uploadUrl, publicUrl };
}

/**
 * Upload a photo buffer directly from the SERVER (no presigned round-trip).
 * Used by the admin panel's "add one user" flow, where the admin's browser
 * uploads the file bytes to our backend as multipart/form-data, and we push
 * it straight to R2 from here.
 */
export async function uploadBufferToR2(
  userId: string,
  buffer: Buffer,
  contentType: string,
): Promise<PresignedUpload & { publicUrl: string }> {
  if (!s3) {
    throw new Error("R2 is not configured");
  }
  const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const key = `photos/${userId}/${randomUUID()}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  const base = env.R2_PUBLIC_BASE_URL.replace(/\/$/, "");
  const publicUrl = `${base}/${key}`;
  return { key, uploadUrl: "", publicUrl };
}
