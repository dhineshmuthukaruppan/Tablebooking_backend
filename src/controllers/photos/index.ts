import type { Request, Response } from "express";
import db from "../../databaseUtilities";
import { generateSignedUploadUrl, getFileBuffer, deleteFile } from "../../config/gcs";

type PhotoCategory = "ambience" | "food";

const TABLE_BOOKING_CONN = db.constants.connectionStrings.tableBooking;

const SERVE_PATH = "/api/v1/photos/serve";

export async function listPhotosHandler(req: Request, res: Response): Promise<void> {
  try {
    const category = (req.query.category as PhotoCategory | undefined) ?? "ambience";

    const docs = (await db.read.find({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: "venue_photos",
      query: { category, isDeleted: { $ne: true } },
      sort: { createdAt: -1 },
    })) as unknown as { url: string; objectName?: string; category: PhotoCategory }[];

    res.status(200).json({
      data: docs.map((doc) => {
        const objectName =
          doc.objectName ??
          (typeof doc.url === "string" && doc.url.includes("storage.googleapis.com")
            ? doc.url.replace(/^https:\/\/storage\.googleapis\.com\/[^/]+\//, "")
            : null);
        return {
          url: objectName
            ? `${SERVE_PATH}?object=${encodeURIComponent(objectName)}`
            : doc.url,
          category: doc.category,
        };
      }),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[photos] listPhotosHandler error", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function uploadPhotoHandler(req: Request, res: Response): Promise<void> {
  try {
    const category = (req.body.category as PhotoCategory | undefined) ?? "ambience";
    const requestedFolder = typeof req.body.folder === "string" ? req.body.folder.trim() : undefined;

    // Menu signed uploads use "folder" = "categories" | "products".
    // Regular landing-page photo signed uploads use "category" = "ambience" | "food".
    const isMenuFolder = requestedFolder === "categories" || requestedFolder === "products";
    const fileName = req.body.fileName;
    const contentType = typeof req.body.contentType === "string" ? req.body.contentType : undefined;

    if (!fileName || typeof fileName !== "string") {
      res.status(400).json({ message: "fileName is required" });
      return;
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const timestamp = Date.now();

    const objectName = isMenuFolder
      ? `table-booking/menu/${requestedFolder}/${timestamp}-${safeName}`
      : `table-booking/${category}/${timestamp}-${safeName}`;

    const { signedUrl } = await generateSignedUploadUrl({
      objectName,
      contentType,
    });

    const serveUrl = `${SERVE_PATH}?object=${encodeURIComponent(objectName)}`;
    res.status(201).json({
      message: "Photo signed-url initialized",
      signedUrl,
      objectName,
      data: { url: serveUrl, category },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[photos] uploadPhotoHandler error", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * POST /photos/complete
 * Create the DB row after the client successfully uploads to the signed URL.
 */
export async function completePhotoUploadHandler(req: Request, res: Response): Promise<void> {
  try {
    const category = (req.body.category as PhotoCategory | undefined) ?? "ambience";
    const objectName = typeof req.body.objectName === "string" ? req.body.objectName : "";

    if (!objectName) {
      res.status(400).json({ message: "objectName is required" });
      return;
    }

    await db.create.insertOne({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: "venue_photos",
      payload: {
        url: `${SERVE_PATH}?object=${encodeURIComponent(objectName)}`,
        objectName,
        category,
        createdAt: new Date(),
      },
    });

    const serveUrl = `${SERVE_PATH}?object=${encodeURIComponent(objectName)}`;
    res.status(201).json({
      message: "Photo upload completed",
      data: { url: serveUrl, category },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[photos] completePhotoUploadHandler error", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

/** Delete a photo: remove from DB and delete from GCS. */
export async function deletePhotoHandler(req: Request, res: Response): Promise<void> {
  try {
    const objectName = req.query.object as string | undefined;
    if (!objectName || typeof objectName !== "string") {
      res.status(400).json({ message: "Missing object parameter" });
      return;
    }

    await db.deleteOp.deleteOne({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: "venue_photos",
      query: { objectName },
    });

    await deleteFile(objectName);

    res.status(200).json({ message: "Photo deleted" });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[photos] deletePhotoHandler error", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

/** Serve a photo from GCS by object name (avoids 403 when bucket is private). */
export async function servePhotoHandler(req: Request, res: Response): Promise<void> {
  try {
    const objectName = req.query.object as string | undefined;
    if (!objectName || typeof objectName !== "string") {
      res.status(400).json({ message: "Missing object parameter" });
      return;
    }
    const result = await getFileBuffer(objectName);
    if (!result) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(result.buffer);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[photos] servePhotoHandler error", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

