import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import crypto from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

let _s3: S3Client | null = null;

function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
      process.env.CLOUDINARY_API_KEY?.trim() &&
      process.env.CLOUDINARY_API_SECRET?.trim()
  );
}

function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.R2_BUCKET_NAME?.trim() &&
      process.env.R2_PUBLIC_URL?.trim()
  );
}

function getR2Client(): S3Client {
  if (!_s3) {
    const accountId = process.env.R2_ACCOUNT_ID!.trim();
    _s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(),
      },
    });
  }
  return _s3;
}

async function uploadToCloudinary(
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME!.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY!.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET!.trim();

  const isVideo = contentType.startsWith("video/");
  const resourceType = isVideo ? "video" : "raw";
  const publicId = filename.replace(/\.[^.]+$/, "");
  const folder = "okike-academy";
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Cloudinary signed upload params (sorted alphabetically)
  const paramsToSign = `folder=${folder}&overwrite=true&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash("sha1")
    .update(paramsToSign + apiSecret)
    .digest("hex");

  const form = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
  form.append("file", blob, filename);
  form.append("api_key", apiKey);
  form.append("timestamp", timestamp);
  form.append("folder", folder);
  form.append("public_id", publicId);
  form.append("overwrite", "true");
  form.append("signature", signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    { method: "POST", body: form }
  );

  const data = (await res.json()) as {
    secure_url?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.secure_url) {
    throw new Error(
      `Cloudinary upload failed: ${data.error?.message || res.statusText}`
    );
  }

  return data.secure_url;
}

/**
 * Stores a video (.mp4/.webm) or subtitle (.vtt) file in:
 * 1. Cloudinary (when CLOUDINARY_* env vars are set)
 * 2. Cloudflare R2 (when R2_* env vars are set)
 * 3. Local public/videos/ (fallback for local-only dev)
 */
export async function storeMediaFile(
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  if (isCloudinaryConfigured()) {
    return uploadToCloudinary(filename, buffer, contentType);
  }

  const cacheBust = Date.now();

  if (isR2Configured()) {
    const bucket = process.env.R2_BUCKET_NAME!.trim();
    const publicBase = process.env.R2_PUBLIC_URL!.trim().replace(/\/+$/, "");
    const key = `videos/${filename}`;

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );

    return `${publicBase}/${key}?t=${cacheBust}`;
  }

  const videosDir = path.join(process.cwd(), "public", "videos");
  await mkdir(videosDir, { recursive: true });
  await writeFile(path.join(videosDir, filename), buffer);
  return `/videos/${filename}?t=${cacheBust}`;
}
