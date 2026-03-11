import type { Request, Response } from "express";
import db from "../../databaseUtilities";
import { uploadPhoto, getFileBuffer, deleteFile } from "../../config/gcs";

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
    const file = (req as unknown as { file?: Express.Multer.File }).file;

    if (!file) {
      res.status(400).json({ message: "Image file is required" });
      return;
    }

    const uploadResult = await uploadPhoto({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      category,
    });

    await db.create.insertOne({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: "venue_photos",
      payload: {
        url: uploadResult.publicUrl,
        objectName: uploadResult.objectName,
        category,
        createdAt: new Date(),
      },
    });

    res.status(201).json({
      message: "Photo uploaded",
      data: {
        url: `${SERVE_PATH}?object=${encodeURIComponent(uploadResult.objectName)}`,
        category,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[photos] uploadPhotoHandler error", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

/** Soft-delete a photo: mark as deleted in DB and delete from GCS. */
export async function deletePhotoHandler(req: Request, res: Response): Promise<void> {
  try {
    const objectName = req.query.object as string | undefined;
    if (!objectName || typeof objectName !== "string") {
      res.status(400).json({ message: "Missing object parameter" });
      return;
    }

    await db.update.updateOne({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: "venue_photos",
      query: { objectName },
      update: { $set: { isDeleted: true, deletedAt: new Date() } },
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

