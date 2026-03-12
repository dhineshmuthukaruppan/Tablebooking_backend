import { Storage } from "@google-cloud/storage";
import { env } from "./env";

type PhotoCategory = "ambience" | "food";

const bucketName = env.GCS_BUCKET;

if (!bucketName) {
  // Fail fast during startup if config is missing so we don't get
  // confusing runtime errors on first upload.
  // eslint-disable-next-line no-console
  console.warn("[gcs] GCS_BUCKET is not set. Photo upload endpoints will fail.");
}

// Use Application Default Credentials (ADC). On Cloud Run, this will use the
// service account attached to the service, which must have Storage permissions.
const storage = bucketName ? new Storage() : undefined;

const bucket = storage && bucketName ? storage.bucket(bucketName) : undefined;

export interface UploadedPhotoInfo {
  publicUrl: string;
  objectName: string;
}

export async function uploadPhoto(params: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  category: PhotoCategory;
  appFolder?: string;
}): Promise<UploadedPhotoInfo> {
  if (!bucket) {
    throw new Error("GCS is not configured. Missing GCS_BUCKET.");
  }

  const { buffer, originalName, mimeType, category, appFolder = "table-booking" } = params;

  const safeName = originalName.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const timestamp = Date.now();
  const objectName = `${appFolder}/${category}/${timestamp}-${safeName}`;

  const file = bucket.file(objectName);

  await file.save(buffer, {
    contentType: mimeType,
    resumable: false,
    // Do not set public: true — it throws when the bucket has "uniform bucket-level access".
    // Make the bucket (or prefix) public via IAM (allUsers = Storage Object Viewer) if you need public URLs.
  });

  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${objectName}`;

  return { publicUrl, objectName };
}

export type MenuImageFolder = "categories" | "products";

/** Upload menu image (category cover or product image). Returns objectName to store in DB. */
export async function uploadMenuImage(params: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  folder: MenuImageFolder;
}): Promise<{ publicUrl: string; objectName: string }> {
  if (!bucket) {
    throw new Error("GCS is not configured. Missing GCS_FILE_UPLOAD_CONFIG or GCS_BUCKET.");
  }

  const { buffer, originalName, mimeType, folder } = params;
  const appFolder = "table-booking";
  const safeName = originalName.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const timestamp = Date.now();
  const objectName = `${appFolder}/menu/${folder}/${timestamp}-${safeName}`;

  const file = bucket.file(objectName);

  await file.save(buffer, {
    contentType: mimeType,
    resumable: false,
  });

  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${objectName}`;

  return { publicUrl, objectName };
}

/** Download a file from GCS (for proxy serve when bucket is private). */
export async function getFileBuffer(objectName: string): Promise<{
  buffer: Buffer;
  contentType: string;
} | null> {
  if (!bucket) return null;
  try {
    const file = bucket.file(objectName);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [buffer] = await file.download();
    const [metadata] = await file.getMetadata();
    const contentType =
      (metadata?.contentType as string) || "application/octet-stream";
    return { buffer, contentType };
  } catch {
    return null;
  }
}

/** Delete a file from GCS. Safe to call even if the file does not exist. */
export async function deleteFile(objectName: string): Promise<void> {
  if (!bucket) return;
  try {
    const file = bucket.file(objectName);
    await file.delete({ ignoreNotFound: true } as { ignoreNotFound: boolean });
  } catch {
    // Swallow errors so a failed delete does not break API responses.
  }
}

