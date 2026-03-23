import type { Request, Response } from "express";
import db from "../../databaseUtilities";
import { ObjectId } from "mongodb";
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

export async function userUploadPhotoHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const category = req.body.category as PhotoCategory;
    if (!category || !["ambience", "food"].includes(category)) {
      res.status(400).json({ message: "Invalid category" });
      return;
    }
    const fileNames = req.body.fileNames as string[];
    const contentTypes = req.body.contentTypes as string[];
    if (!Array.isArray(fileNames) || fileNames.length === 0) {
      res.status(400).json({ message: "fileNames required" });
      return;
    }
    const uploads = [];
    for (let i = 0; i < fileNames.length; i++) {
      const fileName = fileNames[i];
      const contentType = contentTypes?.[i];
      const safeName = fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
      const timestamp = Date.now();
      const objectName = `table-booking/user-uploads/${user.id}/${timestamp}-${safeName}`;
      const { signedUrl } = await generateSignedUploadUrl({ objectName, contentType });
      uploads.push({ signedUrl, objectName, url: `${SERVE_PATH}?object=${encodeURIComponent(objectName)}` });
    }
    res.status(201).json({
      message: "Signed URLs generated",
      uploads,
      category,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[photos] userUploadPhotoHandler error", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function completeUserPhotoUploadHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const category = req.body.category as PhotoCategory;
    const objectNames = req.body.objectNames as string[];
    if (!category || !Array.isArray(objectNames) || objectNames.length === 0) {
      res.status(400).json({ message: "Invalid data" });
      return;
    }
    const images = objectNames.map(obj => ({ url: `${SERVE_PATH}?object=${encodeURIComponent(obj)}`, objectName: obj }));
    await db.create.insertOne({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: "images",
      payload: {
        userId: user.id,
        userName: user.displayName || "",
        userRole: user.role || "user",
        category,
        images,
        isApproved: false,
        createdAt: new Date(),
      },
    });
    res.status(201).json({ message: "Upload completed" });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[photos] completeUserPhotoUploadHandler error", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function listUserImagesHandler(req: Request, res: Response): Promise<void> {
  try {
    const status = req.query.status as "approved" | "not_approved";
    const userRole = req.query.userRole as "staff" | "user" | "both";
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const query: any = {};
    if (status === "approved") query.isApproved = true;
    else if (status === "not_approved") query.isApproved = false;
    if (userRole === "staff") query.userRole = "staff";
    else if (userRole === "user") query.userRole = "user";
    const skip = (page - 1) * limit;
    const docs = await db.read.find({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: "images",
      query,
      sort: { createdAt: -1 },
      skip,
      limit,
    });
    const total = await db.read.count({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: "images",
      query,
    });
    res.status(200).json({
      data: docs,
      total,
      page,
      limit,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[photos] listUserImagesHandler error", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function approveUserImageHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = new ObjectId(req.params.id);
    const imageApprovals = req.body.imageApprovals as boolean[] | undefined;
    
    if (!Array.isArray(imageApprovals) || imageApprovals.length === 0) {
      res.status(400).json({ message: "imageApprovals array required" });
      return;
    }

    const doc = await db.read.findOne({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: "images",
      query: { _id: id },
    });
    
    if (!doc) {
      res.status(404).json({ message: "Not found" });
      return;
    }

    const images = doc.images ?? [];
    if (imageApprovals.length !== images.length) {
      res.status(400).json({ message: "imageApprovals length must match images length" });
      return;
    }

    // Process each image approval
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const isApproved = imageApprovals[i];

      if (isApproved) {
        // Add to venue_photos if approved
        const exists = await db.read.findOne({
          req,
          connectionString: TABLE_BOOKING_CONN,
          collection: "venue_photos",
          query: { objectName: img.objectName },
        });

        if (!exists) {
          await db.create.insertOne({
            req,
            connectionString: TABLE_BOOKING_CONN,
            collection: "venue_photos",
            payload: {
              url: img.url,
              objectName: img.objectName,
              category: doc.category,
              createdAt: new Date(),
            },
          });
        }
      } else {
        // Remove from venue_photos if disapproved
        await db.update.updateOne({
          req,
          connectionString: TABLE_BOOKING_CONN,
          collection: "venue_photos",
          query: { objectName: img.objectName },
          update: { $set: { isDeleted: true, deletedAt: new Date() } },
        });
      }
    }

    // Set document isApproved to true if ANY image is approved
    const hasApprovedImages = imageApprovals.some((a) => a === true);

    await db.update.updateOne({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: "images",
      query: { _id: id },
      update: { 
        $set: { 
          imageApprovals,
          isApproved: hasApprovedImages,
          updatedAt: new Date() 
        } 
      },
    });

    res.status(200).json({ 
      message: "Image approvals updated",
      data: { isApproved: hasApprovedImages, imageApprovals }
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[photos] approveUserImageHandler error", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

