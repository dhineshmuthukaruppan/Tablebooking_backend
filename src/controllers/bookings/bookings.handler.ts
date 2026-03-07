import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import db from "../../databaseUtilities";

const GUEST_DATE_QUERY = { type: "default" } as const;

/** GET /bookings — with query customerId: that customer's orders; without: all bookings. */
export async function listBookingsHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const customerId = typeof req.query.customerId === "string" ? req.query.customerId.trim() : null;
    const query = customerId ? { userId: new ObjectId(customerId) } : {};
    const list = await db.read.find({
      req,
      connectionString,
      collection: "bookings",
      query,
      sort: { createdAt: -1 },
    });
    res.status(200).json({
      message: "Bookings",
      data: list ?? [],
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

/** POST /bookings — create a booking (body: customerName, customerEmail, customerPhone?, bookingDate, sectionId, sectionName, slot, guestCount). */
export async function createBookingHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user?.id) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const body = req.body as {
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      bookingDate?: string;
      sectionId?: string;
      sectionName?: string;
      slot?: { startTime?: string; endTime?: string };
      guestCount?: number;
    };
    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
    const customerEmail = typeof body.customerEmail === "string" ? body.customerEmail.trim() : (user.email ?? "").toLowerCase();
    const customerPhone = typeof body.customerPhone === "string" ? body.customerPhone.trim() : "";
    const bookingDateStr = typeof body.bookingDate === "string" ? body.bookingDate.trim() : "";
    const sectionIdStr = typeof body.sectionId === "string" ? body.sectionId.trim() : "";
    const sectionName = typeof body.sectionName === "string" ? body.sectionName.trim() : "";
    const slot = body.slot && typeof body.slot === "object" ? body.slot : {};
    const startTime = typeof slot.startTime === "string" ? slot.startTime.trim() : "";
    const endTime = typeof slot.endTime === "string" ? slot.endTime.trim() : "";
    const guestCount = typeof body.guestCount === "number" ? Math.max(1, Math.floor(body.guestCount)) : 1;

    if (!customerName || !bookingDateStr || !sectionIdStr || !sectionName || !startTime || !endTime) {
      res.status(400).json({
        message: "Missing required fields: customerName, bookingDate, sectionId, sectionName, slot.startTime, slot.endTime",
      });
      return;
    }
    const bookingDate = new Date(bookingDateStr);
    if (Number.isNaN(bookingDate.getTime())) {
      res.status(400).json({ message: "Invalid bookingDate" });
      return;
    }
    let sectionId: ObjectId;
    try {
      sectionId = new ObjectId(sectionIdStr);
    } catch {
      res.status(400).json({ message: "Invalid sectionId" });
      return;
    }

    const now = new Date();
    const doc = {
      userId: user.id,
      customerName,
      customerPhone: customerPhone || undefined,
      customerEmail: customerEmail || undefined,
      bookingDate,
      sectionId,
      sectionName,
      slot: { startTime, endTime },
      guestCount,
      status: "pending",
      coupon: null,
      billing: null,
      payment: {
        status: "pending",
        method: null,
        initiatedByStaff: false,
        stripePaymentIntentId: null,
        paidAt: null,
      },
      feedbackRequired: false,
      feedback: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.create.insertOne({
      req,
      connectionString: db.constants.connectionStrings.tableBooking,
      collection: "bookings",
      payload: doc as unknown as Record<string, unknown>,
    });
    res.status(201).json({
      message: "Booking created",
      data: doc,
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

/** Returns guest-dates config and active meal-time sections for the booking flow. */
export async function getBookingConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;

    const [guestDateDoc, mealTimeList] = await Promise.all([
      db.read.findOne({
        req,
        connectionString,
        collection: "guest_date",
        query: GUEST_DATE_QUERY,
      }),
      db.read.find({
        req,
        connectionString,
        collection: "meal_time_master",
        query: { isActive: true },
        sort: { startTime: 1 },
      }),
    ]);

    const guestDate = guestDateDoc as { maxGuestCount?: number; maxDaysCount?: number } | null;
    const sections = (mealTimeList ?? []) as Array<Record<string, unknown>>;

    const maxGuestCount = guestDate?.maxGuestCount ?? 30;
    const maxDaysCount = guestDate?.maxDaysCount ?? 30;

    res.status(200).json({
      message: "Booking config",
      data: {
        guestDates: { maxGuestCount, maxDaysCount },
        mealTimeSections: sections,
      },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}
