import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import db from "../../databaseUtilities";

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
      isPublicVisible: false,
      profile: {
        user_name: userDisplayName ?? (userEmail || "Guest"),
        email: userEmail,
      },
      imageApprovals: images?.length ? images.map(() => false) : undefined,
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
          },
          updatedAt: now,
        },
      },
    });

    res.status(201).json({ message: "Feedback submitted", data: feedbackDoc });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

/** GET /feedback/public — fetch feedbacks where isPublicVisible is true. Returns profile, ratings, description, and only approved images. */
export async function getPublicFeedbackHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const rawList = await db.read.find({
      req,
      connectionString,
      collection: "feedbacks",
      query: { isPublicVisible: true },
      sort: { createdAt: -1 },
      limit: 100,
    });
    const list = rawList.map((doc: Record<string, unknown>) => {
      const images = doc.images as string[] | undefined;
      const imageApprovals = doc.imageApprovals as boolean[] | undefined;
      let publicImages: string[] = [];
      if (Array.isArray(images) && images.length > 0) {
        if (Array.isArray(imageApprovals) && imageApprovals.length === images.length) {
          publicImages = images.filter((_, i) => imageApprovals[i] === true);
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
        createdAt: doc.createdAt,
      };
    });
    res.status(200).json({ message: "Public feedback", data: list });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}
