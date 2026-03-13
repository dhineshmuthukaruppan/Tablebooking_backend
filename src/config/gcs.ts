import fs from "fs";
import path from "path";
import { Storage } from "@google-cloud/storage";
import { GoogleAuth } from "google-auth-library";
import { env } from "./env";

type PhotoCategory = "ambience" | "food";

const bucketName = env.GCS_BUCKET;

if (!bucketName) {
  // Fail fast during startup if config is missing so we don't get
  // confusing runtime errors on first upload.
  // eslint-disable-next-line no-console
  console.warn("[gcs] GCS_BUCKET is not set. Photo upload endpoints will fail.");
}

const localCredentialsPath = path.resolve(
  process.cwd(),
  "secrets",
  "gcs-credentials.json"
);

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
});

let storagePromise: Promise<Storage | undefined> | undefined;

async function createStorage(): Promise<Storage | undefined> {
  if (!bucketName) return undefined;

  try {
    await auth.getClient();
    return new Storage();
  } catch (error) {
    const canUseLocalFallback =
      env.NODE_ENV !== "production" && fs.existsSync(localCredentialsPath);

    if (canUseLocalFallback) {
      // eslint-disable-next-line no-console
      console.warn(
        `[gcs] ADC is not available. Falling back to local credentials file at ${localCredentialsPath}.`
      );
      return new Storage({ keyFilename: localCredentialsPath });
    }

    throw new Error(
      "[gcs] No Google Cloud credentials available. Run `gcloud auth application-default login`, set `GOOGLE_APPLICATION_CREDENTIALS`, or add `secrets/gcs-credentials.json` for local development.",
      { cause: error instanceof Error ? error : undefined }
    );
  }
}

async function getStorage(): Promise<Storage | undefined> {
  if (!storagePromise) {
    storagePromise = createStorage();
  }
  return storagePromise;
}

async function getBucket() {
  const storage = await getStorage();
  return storage && bucketName ? storage.bucket(bucketName) : undefined;
}

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
  const bucket = await getBucket();
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
  const bucket = await getBucket();
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
  const bucket = await getBucket();
  if (!bucket) return;
  try {
    const file = bucket.file(objectName);
    await file.delete({ ignoreNotFound: true } as { ignoreNotFound: boolean });
  } catch {
    // Swallow errors so a failed delete does not break API responses.
  }
}

