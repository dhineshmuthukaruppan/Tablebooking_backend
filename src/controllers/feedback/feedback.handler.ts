import type { Request, Response } from "express";
import { MongoClient, ObjectId } from "mongodb";
import db from "../../databaseUtilities";
import { uploadPhoto, deleteFile } from "../../config/gcs";

const FEEDBACK_SERVE_PATH = "/api/v1/photos/serve";

/** GET /feedback?bookingId=xxx — get feedback for one booking (own only). */
export async function getFeedbackByBookingIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user?.id) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const bookingId = typeof req.query.bookingId === "string" ? req.query.bookingId.trim() : "";
    if (!bookingId || !ObjectId.isValid(bookingId)) {
      res.status(400).json({ message: "Valid bookingId is required" });
      return;
    }
    const connectionString = db.constants.connectionStrings.tableBooking;
    const doc = await db.read.findOne({
      req,
      connectionString,
      collection: "feedbacks",
      query: { bookingId: new ObjectId(bookingId), userId: user.id },
    });
    res.status(200).json({ message: "Feedback", data: doc ?? null });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

/** POST /feedback/images — upload a single feedback media (image/video) to GCS and return its URL + object name. */
export async function uploadFeedbackImageHandler(req: Request, res: Response): Promise<void> {
  try {
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ message: "Media file is required" });
      return;
    }
    const isImage = typeof file.mimetype === "string" && file.mimetype.startsWith("image/");
    const isVideo = typeof file.mimetype === "string" && file.mimetype.startsWith("video/");
    if (!isImage && !isVideo) {
      res.status(400).json({ message: "Only image/video uploads are allowed" });
      return;
    }
    if (isVideo && file.size > 20 * 1024 * 1024) {
      res.status(400).json({ message: "Video size must be 20MB or smaller" });
      return;
    }
    const uploadResult = await uploadPhoto({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      // Reuse an existing category; keep feedback assets in a separate folder.
      category: "ambience",
      appFolder: "table-booking-feedback",
    });
    res.status(201).json({
      message: "Feedback media uploaded",
      data: {
        url: `${FEEDBACK_SERVE_PATH}?object=${encodeURIComponent(uploadResult.objectName)}`,
        objectName: uploadResult.objectName,
      },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

/** DELETE /feedback/images?object=... — delete a feedback image from GCS by object name. */
export async function deleteFeedbackImageHandler(req: Request, res: Response): Promise<void> {
  try {
    const objectName = req.query.object as string | undefined;
    if (!objectName || typeof objectName !== "string") {
      res.status(400).json({ message: "Missing object parameter" });
      return;
    }
    await deleteFile(objectName);
    res.status(200).json({ message: "Feedback image deleted" });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

/** POST /feedback — submit feedback for a booking. Body: bookingId, overallRating, foodRating?, serviceRating?, atmosphereRating?, description?, images? */
export async function submitFeedbackHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user?.id) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const body = req.body as {
      bookingId?: string;
      overallRating?: number;
      foodRating?: number;
      serviceRating?: number;
      atmosphereRating?: number;
      description?: string;
      images?: string[];
      videos?: string[];
      canRedeem?: boolean;
      skipped?: boolean;
    };
    const bookingIdStr = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
    if (!bookingIdStr || !ObjectId.isValid(bookingIdStr)) {
      res.status(400).json({ message: "Valid bookingId is required" });
      return;
    }
    const overallRating = typeof body.overallRating === "number" ? Math.min(5, Math.max(0, body.overallRating)) : 0;
    const foodRating = typeof body.foodRating === "number" ? Math.min(5, Math.max(0, body.foodRating)) : undefined;
    const serviceRating = typeof body.serviceRating === "number" ? Math.min(5, Math.max(0, body.serviceRating)) : undefined;
    const atmosphereRating = typeof body.atmosphereRating === "number" ? Math.min(5, Math.max(0, body.atmosphereRating)) : undefined;
    const description = typeof body.description === "string" ? body.description.trim() : undefined;
    const images = Array.isArray(body.images) ? body.images.filter((u): u is string => typeof u === "string") : undefined;
    const videos = Array.isArray(body.videos) ? body.videos.filter((u): u is string => typeof u === "string") : undefined;

    const connectionString = db.constants.connectionStrings.tableBooking;
    const booking = await db.read.findOne({
      req,
      connectionString,
      collection: "bookings",
      query: { _id: new ObjectId(bookingIdStr), userId: user.id },
    });
    if (!booking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    const now = new Date();
    const coupon = booking.coupon ?? null;
    const skipped = body.skipped === true;
    const bookingUserId =
      booking.userId instanceof ObjectId
        ? booking.userId
        : typeof booking.userId === "string" && ObjectId.isValid(booking.userId)
          ? new ObjectId(booking.userId)
          : null;
    const canRedeemRequested = body.canRedeem === true && !skipped;
    const canRedeem =
      canRedeemRequested &&
      coupon?.isReserved === true &&
      coupon?.isRedeemed !== true &&
      coupon?.couponId instanceof ObjectId &&
      bookingUserId != null;
    const userDisplayName = (user as { displayName?: string }).displayName;
    const userEmail = (user as { email?: string }).email ?? "";
    const feedbackDoc = {
      userId: user.id,
      bookingId: new ObjectId(bookingIdStr),
      overallRating,
      foodRating,
      serviceRating,
      atmosphereRating,
      description: description ?? undefined,
      images: images?.length ? images : undefined,
      videos: videos?.length ? videos : undefined,
      isPublicVisible: false,
      skipped: skipped ? true : undefined,
      profile: {
        user_name: userDisplayName ?? (userEmail || "Guest"),
        email: userEmail,
      },
      imageApprovals: images?.length ? images.map(() => false) : undefined,
      videoApprovals: videos?.length ? videos.map(() => false) : undefined,
      createdAt: now,
      updatedAt: now,
    };
    const insertResult = await db.create.insertOne({
      req,
      connectionString,
      collection: "feedbacks",
      payload: feedbackDoc as unknown as Record<string, unknown>,
    });

    const insertedFeedbackId = insertResult?.insertedId;

    await db.update.updateOne({
      req,
      connectionString,
      collection: "bookings",
      query: { _id: new ObjectId(bookingIdStr) },
      update: {
        $set: {
          feedback: {
            _id: insertedFeedbackId,
            rating: overallRating,
            comment: description ?? "",
            submittedAt: now,
            ...(skipped ? { skipped: true } : {}),
          },
          updatedAt: now,
        },
      },
    });

    // Mark allocations as feedback-given + redeem coupon (if allowed) in a single transaction.
    const dbConn = (req.app.locals as Record<string, unknown>)[connectionString + "DB"] as import("mongodb").Db | undefined;
    const client = (req.app.locals as Record<string, unknown>)[connectionString + "CLIENT"] as MongoClient | undefined;
    if (dbConn && client) {
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          await db.update.updateMany({
            req,
            connectionString,
            collection: db.constants.dbTables.table_allocations,
            query: { bookingId: bookingIdStr },
            update: { $set: { isFeedbackGiven: true, updatedAt: now } },
            options: { session },
          });
          if (canRedeem) {
            // Run the 4 redemption operations concurrently within the same session/transaction.
            await Promise.all([
             
              db.update.updateOne({
                req,
                connectionString,
                collection: db.constants.dbTables.bookings,
                query: { _id: new ObjectId(bookingIdStr) },
                update: { $set: { "coupon.isRedeemed": true, "coupon.redeemedAt": now, updatedAt: now } },
                options: { session },
              }),
              db.update.updateOne({
                req,
                connectionString,
                collection: db.constants.dbTables.coupons,
                query: { _id: coupon!.couponId as ObjectId },
                update: { $inc: { totalUsed: 1 }, $set: { updatedAt: now } },
                options: { session },
              }),
              db.create.insertOne({
                req,
                connectionString,
                collection:  db.constants.dbTables.redeems,
                payload: {
                  couponId: coupon!.couponId as ObjectId,
                  userId: bookingUserId as ObjectId,
                  bookingId: new ObjectId(bookingIdStr),
                  redeemedAt: now,
                  isFeedbackGiven: true,
                  appliedPercentage: coupon?.appliedPercentage ?? undefined,
                },
                options: { session },
              }),
            ]);
          }
        });
      } finally {
        await session.endSession();
      }
    }
    res.status(201).json({ message: "Feedback submitted", data: feedbackDoc });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

/** GET /feedback/public — fetch feedbacks where isPublicVisible is true. Returns profile, ratings, description, and only approved media. */
export async function getPublicFeedbackHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const pageRaw = typeof req.query.page === "string" ? Number(req.query.page) : 1;
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 10;
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(50, Math.floor(limitRaw)) : 10;
    const skip = (page - 1) * limit;

    const query = { isPublicVisible: true };

    const [rawList, total] = await Promise.all([
      db.read.find({
      req,
      connectionString,
      collection: "feedbacks",
        query,
        sort: { overallRating: -1, createdAt: -1 },
        skip,
        limit,
      }),
      db.read.count({
        req,
        connectionString,
        collection: "feedbacks",
        query,
      }),
    ]);
    const list = rawList.map((doc: Record<string, unknown>) => {
      const images = doc.images as string[] | undefined;
      const imageApprovals = doc.imageApprovals as boolean[] | undefined;
      const videos = doc.videos as string[] | undefined;
      const videoApprovals = doc.videoApprovals as boolean[] | undefined;
      let publicImages: string[] = [];
      let publicVideos: string[] = [];
      if (Array.isArray(images) && images.length > 0) {
        if (Array.isArray(imageApprovals) && imageApprovals.length === images.length) {
          publicImages = images.filter((_, i) => imageApprovals[i] === true);
        }
      }
      if (Array.isArray(videos) && videos.length > 0) {
        if (Array.isArray(videoApprovals) && videoApprovals.length === videos.length) {
          publicVideos = videos.filter((_, i) => videoApprovals[i] === true);
        }
      }
      return {
        _id: doc._id,
        profile: doc.profile,
        overallRating: doc.overallRating,
        foodRating: doc.foodRating,
        serviceRating: doc.serviceRating,
        atmosphereRating: doc.atmosphereRating,
        description: doc.description,
        images: publicImages,
        videos: publicVideos,
        createdAt: doc.createdAt,
      };
    });
    res.status(200).json({ message: "Public feedback", data: list, total, page, limit });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}
