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
    const feedbackDoc = {
      userId: user.id,
      bookingId: new ObjectId(bookingIdStr),
      overallRating,
      foodRating,
      serviceRating,
      atmosphereRating,
      description: description ?? undefined,
      images: images?.length ? images : undefined,
      createdAt: now,
      updatedAt: now,
    };
    await db.create.insertOne({
      req,
      connectionString,
      collection: "feedbacks",
      payload: feedbackDoc as unknown as Record<string, unknown>,
    });

    await db.update.updateOne({
      req,
      connectionString,
      collection: "bookings",
      query: { _id: new ObjectId(bookingIdStr) },
      update: {
        $set: {
          feedback: {
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
