import type { Request, Response } from "express";
import db from "../../databaseUtilities";
import { ObjectId } from "mongodb";
import { generateSignedUploadUrl, getFileBuffer, deleteFile } from "../../config/gcs";

const TABLE_BOOKING_CONN = db.constants.connectionStrings.tableBooking;
const SERVE_PATH = "/api/v1/photos/serve";

/** Resolves category slug + ObjectId from a categoryId string. Returns null if not found/invalid. */
async function resolveCategoryById(
  req: Request,
  categoryId: string
): Promise<{ slug: string; _id: ObjectId } | null> {
  try {
    const doc = await db.read.findOne({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: "photo_categories",
      query: { _id: new ObjectId(categoryId) },
    });
    if (!doc) return null;
    return { slug: doc.slug as string, _id: new ObjectId(categoryId) };
  } catch {
    return null;
  }
}

export async function listPhotosHandler(req: Request, res: Response): Promise<void> {
  try {
    const categoryIdParam = req.query.categoryId as string | undefined;
    const categorySlug = req.query.category as string | undefined;

    // Build query: prefer categoryId lookup (stable across renames), fall back to slug
    let query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (categoryIdParam) {
      try {
        query.categoryId = new ObjectId(categoryIdParam);
      } catch {
        res.status(400).json({ message: "Invalid categoryId" });
        return;
      }
    } else if (categorySlug) {
      query.category = categorySlug;
    }

    const docs = (await db.read.find({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: "venue_photos",
      query,
      sort: { createdAt: -1 },
    })) as unknown as { url: string; objectName?: string; category: string }[];

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
    const requestedFolder = typeof req.body.folder === "string" ? req.body.folder.trim() : undefined;
    const isMenuFolder = requestedFolder === "categories" || requestedFolder === "products";
    const fileName = req.body.fileName;
    const contentType = typeof req.body.contentType === "string" ? req.body.contentType : undefined;

    if (!fileName || typeof fileName !== "string") {
      res.status(400).json({ message: "fileName is required" });
      return;
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const timestamp = Date.now();

    let categorySlug = "general";
    let categoryObjId: ObjectId | null = null;

    if (!isMenuFolder) {
      const categoryId = req.body.categoryId as string | undefined;
      const categoryFallback = req.body.category as string | undefined;
      if (categoryId) {
        const resolved = await resolveCategoryById(req, categoryId);
        if (!resolved) {
          res.status(400).json({ message: "Invalid categoryId" });
          return;
        }
        categorySlug = resolved.slug;
        categoryObjId = resolved._id;
      } else if (categoryFallback) {
        categorySlug = categoryFallback; // backward compat
      }
    }

    const objectName = isMenuFolder
      ? `table-booking/menu/${requestedFolder}/${timestamp}-${safeName}`
      : `table-booking/${categorySlug}/${timestamp}-${safeName}`;

    const { signedUrl } = await generateSignedUploadUrl({ objectName, contentType });

    const serveUrl = `${SERVE_PATH}?object=${encodeURIComponent(objectName)}`;
    res.status(201).json({
      message: "Photo signed-url initialized",
      signedUrl,
      objectName,
      data: { url: serveUrl, category: categorySlug, categoryId: categoryObjId ?? undefined },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[photos] uploadPhotoHandler error", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

/** POST /photos/complete */
export async function completePhotoUploadHandler(req: Request, res: Response): Promise<void> {
  try {
    const objectName = typeof req.body.objectName === "string" ? req.body.objectName : "";
    if (!objectName) {
      res.status(400).json({ message: "objectName is required" });
      return;
    }

    let categorySlug = "general";
    let categoryObjId: ObjectId | undefined;

    const categoryId = req.body.categoryId as string | undefined;
    const categoryFallback = req.body.category as string | undefined;
    if (categoryId) {
      const resolved = await resolveCategoryById(req, categoryId);
      if (resolved) {
        categorySlug = resolved.slug;
        categoryObjId = resolved._id;
      }
    } else if (categoryFallback) {
      categorySlug = categoryFallback;
    }

    const payload: Record<string, unknown> = {
      url: `${SERVE_PATH}?object=${encodeURIComponent(objectName)}`,
      objectName,
      category: categorySlug,
      createdAt: new Date(),
    };
    if (categoryObjId) payload.categoryId = categoryObjId;

    await db.create.insertOne({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: "venue_photos",
      payload,
    });

    const serveUrl = `${SERVE_PATH}?object=${encodeURIComponent(objectName)}`;
    res.status(201).json({
      message: "Photo upload completed",
      data: { url: serveUrl, category: categorySlug, categoryId: categoryObjId ?? undefined },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[photos] completePhotoUploadHandler error", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

/** Soft-delete a photo. */
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

/** Serve a photo from GCS by object name. */
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

    const categoryId = req.body.categoryId as string | undefined;
    const fileNames = req.body.fileNames as string[];
    const contentTypes = req.body.contentTypes as string[];

    if (!categoryId) {
      res.status(400).json({ message: "categoryId is required" });
      return;
    }

    const resolved = await resolveCategoryById(req, categoryId);
    if (!resolved) {
      res.status(400).json({ message: "Invalid category" });
      return;
    }

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
      category: resolved.slug,
      categoryId: resolved._id,
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

    const categoryId = req.body.categoryId as string | undefined;
    const objectNames = req.body.objectNames as string[];

    if (!categoryId || !Array.isArray(objectNames) || objectNames.length === 0) {
      res.status(400).json({ message: "Invalid data" });
      return;
    }

    const resolved = await resolveCategoryById(req, categoryId);
    if (!resolved) {
      res.status(400).json({ message: "Invalid category" });
      return;
    }

    const images = objectNames.map((obj) => ({
      url: `${SERVE_PATH}?object=${encodeURIComponent(obj)}`,
      objectName: obj,
    }));

    await db.create.insertOne({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: "images",
      payload: {
        userId: user.id,
        userName: user.displayName || "",
        userRole: user.role || "user",
        category: resolved.slug,
        categoryId: resolved._id,
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
    const userRole = req.query.userRole as "staff" | "user" | "both" | undefined;
    const category = req.query.category as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const query: Record<string, unknown> = {};
    if (status === "approved") query.isApproved = true;
    else if (status === "not_approved") query.isApproved = false;
    if (userRole === "staff") query.userRole = "staff";
    else if (userRole === "user") query.userRole = "user";
    if (category && category !== "all") query.category = category;
    if (dateFrom || dateTo) {
      const dateQuery: Record<string, Date> = {};
      if (dateFrom) dateQuery.$gte = new Date(dateFrom);
      if (dateTo) dateQuery.$lte = new Date(dateTo);
      query.createdAt = dateQuery;
    }

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

    res.status(200).json({ data: docs, total, page, limit });
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

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const isApproved = imageApprovals[i];

      if (isApproved) {
        const exists = await db.read.findOne({
          req,
          connectionString: TABLE_BOOKING_CONN,
          collection: "venue_photos",
          query: { objectName: img.objectName },
        });

        if (!exists) {
          const venuePhotoPayload: Record<string, unknown> = {
            url: img.url,
            objectName: img.objectName,
            category: doc.category,
            createdAt: new Date(),
          };
          if (doc.categoryId) venuePhotoPayload.categoryId = doc.categoryId;

          await db.create.insertOne({
            req,
            connectionString: TABLE_BOOKING_CONN,
            collection: "venue_photos",
            payload: venuePhotoPayload,
          });
        }
      } else {
        await db.update.updateOne({
          req,
          connectionString: TABLE_BOOKING_CONN,
          collection: "venue_photos",
          query: { objectName: img.objectName },
          update: { $set: { isDeleted: true, deletedAt: new Date() } },
        });
      }
    }

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
          updatedAt: new Date(),
        },
      },
    });

    res.status(200).json({
      message: "Image approvals updated",
      data: { isApproved: hasApprovedImages, imageApprovals },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[photos] approveUserImageHandler error", error);
    res.status(500).json({ message: "Internal server error" });
  }
}
