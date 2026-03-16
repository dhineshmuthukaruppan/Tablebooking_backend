import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import db from "../../databaseUtilities";
import {
  sendAdminBookingCancellationEmail,
  sendAdminBookingConfirmationEmail,
  sendBookingCancellationEmail,
  sendBookingConfirmationEmail,
} from "../../services/email/email.service";

const ADMIN_BOOKING_STATUSES = ["pending", "confirmed", "completed", "noshow", "cancelled"] as const;
type AdminBookingStatus = (typeof ADMIN_BOOKING_STATUSES)[number];

function formatBookingDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export interface AdminListBookingsBody {
  page?: number;
  limit?: number;
  status?: AdminBookingStatus[];
  bookingDateStart?: string; // YYYY-MM-DD
  bookingDateEnd?: string;   // YYYY-MM-DD
  name?: string;
  email?: string;
  phone?: string;
  guestCount?: number;
  section?: string[];
  feedback?: "given" | "required";
  /** Filter by slot (24h "HH:mm"). Booking has slot: { startTime, endTime }. */
  slots?: { startTime: string; endTime: string }[];
}

/**
 * POST /admin/bookings/list — admin/staff list bookings with filters + pagination.
 * Server-side pagination; filters on status, bookingDate (single day), name, email, phone,
 * guestCount, sectionName, feedback (given/required).
 */
export async function listAdminBookingsHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = (req.body as AdminListBookingsBody) ?? {};
    const page = Math.max(1, Number(body.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(body.limit) || 20));
    const skip = (page - 1) * limit;

    const connectionString = db.constants.connectionStrings.tableBooking;

    const query: Record<string, unknown> = {};

    // Status filter
    const statusArr = Array.isArray(body.status) ? body.status : [];
    const validStatuses = statusArr.filter((s) => ADMIN_BOOKING_STATUSES.includes(s as AdminBookingStatus));
    if (validStatuses.length > 0) {
      query.status = { $in: validStatuses };
    }

    // bookingDate filter – range between start and end (inclusive)
    const startStr =
      typeof body.bookingDateStart === "string" && body.bookingDateStart.trim()
        ? body.bookingDateStart.trim()
        : undefined;
    const endStr =
      typeof body.bookingDateEnd === "string" && body.bookingDateEnd.trim()
        ? body.bookingDateEnd.trim()
        : undefined;
    if (startStr || endStr) {
      const range: { $gte?: Date; $lte?: Date } = {};
      if (startStr) {
        const start = new Date(`${startStr}T00:00:00.000Z`);
        if (!Number.isNaN(start.getTime())) range.$gte = start;
      }
      if (endStr) {
        const end = new Date(`${endStr}T23:59:59.999Z`);
        if (!Number.isNaN(end.getTime())) range.$lte = end;
      }
      if (Object.keys(range).length > 0) {
        query.bookingDate = range;
      }
    }

    // Text filters
    if (typeof body.name === "string" && body.name.trim()) {
      query.customerName = { $regex: body.name.trim(), $options: "i" };
    }
    if (typeof body.email === "string" && body.email.trim()) {
      query.customerEmail = { $regex: body.email.trim(), $options: "i" };
    }
    if (typeof body.phone === "string" && body.phone.trim()) {
      query.customerPhone = { $regex: body.phone.trim(), $options: "i" };
    }

    // Guest count (exact match)
    if (typeof body.guestCount === "number" && Number.isFinite(body.guestCount) && body.guestCount > 0) {
      query.guestCount = body.guestCount;
    }

    // Section filter
    const sectionsArr = Array.isArray(body.section) ? body.section.filter((s) => typeof s === "string" && s.trim()) : [];
    if (sectionsArr.length > 0) {
      query.sectionName = { $in: sectionsArr };
    }

    // Feedback filter
    if (body.feedback === "given") {
      query.feedback = { $ne: null };
    } else if (body.feedback === "required") {
      query.feedbackRequired = true;
    }

    // Slot filter: booking.slot = { startTime: "07:30", endTime: "08:00" } (24h)
    const slotsArr = Array.isArray(body.slots) ? body.slots : [];
    const validSlots = slotsArr.filter(
      (s) =>
        typeof s?.startTime === "string" &&
        s.startTime.trim() !== "" &&
        typeof s?.endTime === "string" &&
        s.endTime.trim() !== ""
    );
    if (validSlots.length > 0) {
      query.$or = validSlots.map((s) => ({
        "slot.startTime": s.startTime.trim(),
        "slot.endTime": s.endTime.trim(),
      }));
    }

    const projection = {
      customerName: 1,
      customerEmail: 1,
      customerPhone: 1,
      bookingDate: 1,
      sectionName: 1,
      slot: 1,
      guestCount: 1,
      status: 1,
      payment: 1,
      feedback: 1,
      feedbackRequired: 1,
      createdAt: 1,
      updatedAt: 1,
    };

    const [items, total, sectionsDocs] = await Promise.all([
      db.read.find({
        req,
        connectionString,
        collection: "bookings",
        query,
        projection,
        sort: { createdAt: -1 },
        skip,
        limit,
      }),
      db.read.count({
        req,
        connectionString,
        collection: "bookings",
        query,
      }),
      db.read.find({
        req,
        connectionString,
        collection: "bookings",
        query: {}, // all sections from all bookings
        projection: { sectionName: 1 },
        limit: 5000,
      }),
    ]);

    const sections = Array.from(
      new Set(
        (sectionsDocs as { sectionName?: string }[]).map((d) => (typeof d.sectionName === "string" ? d.sectionName : "")).filter(Boolean)
      )
    );

    res.status(200).json({
      message: "Admin bookings list",
      data: {
        items: items ?? [],
        total: total ?? 0,
        page,
        limit,
        sections,
      },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * PATCH /admin/bookings/:id — admin/staff update booking: status, billing, payment, feedbackRequired.
 * Used when: 1) marking booking as "completed" on table assign, 2) submitting payment.
 */
export async function patchBookingByAdminHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || typeof id !== "string" || !ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid booking id" });
      return;
    }
    const staff = req.user;
    if (!staff?.id) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const staffId = staff.id instanceof ObjectId ? staff.id : new ObjectId((staff.id as string).toString());
    const body = req.body as {
      status?: string;
      billing?: { actualAmount?: number; discountAmount?: number; finalAmount?: number };
      payment?: {
        status?: "pending" | "paid";
        method?: "stripe" | "cash" | "card";
        stripePaymentIntentId?: string | null;
        paidAt?: Date | null;
      };
      feedbackRequired?: boolean;
    };

    const connectionString = db.constants.connectionStrings.tableBooking;
    const query = { _id: new ObjectId(id) };
    const now = new Date();
    const updates: Record<string, unknown> = { updatedAt: now };
    const existingBooking = await db.read.findOne({
      req,
      connectionString,
      collection: "bookings",
      query,
    }) as {
      _id?: ObjectId;
      userId?: ObjectId | string | null;
      customerEmail?: string;
      customerName?: string;
      bookingDate?: Date;
      sectionName?: string;
      slot?: { startTime?: string; endTime?: string };
      guestCount?: number;
      status?: string;
    } | null;

    if (!existingBooking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    const previousStatus = existingBooking.status;

    if (body.status !== undefined) {
      const valid = ["pending", "confirmed", "completed", "noshow", "cancelled"].includes(body.status);
      if (!valid) {
        res.status(400).json({ message: "Invalid status" });
        return;
      }
      updates.status = body.status;
      updates.feedbackRequired = body.status === "completed";
      (updates as Record<string, unknown>)["payment.status"] =
        body.status === "completed" ? "pending" : null;
    }

    if (body.billing !== undefined) {
      const actual = Number(body.billing.actualAmount);
      const discount = Number(body.billing.discountAmount ?? 0);
      const finalAmount =
        typeof body.billing.finalAmount === "number"
          ? body.billing.finalAmount
          : (Number.isFinite(actual) ? actual : 0) - (Number.isFinite(discount) ? discount : 0);
      updates.billing = {
        actualAmount: Number.isFinite(actual) ? actual : 0,
        discountAmount: Number.isFinite(discount) ? discount : 0,
        finalAmount: Math.max(0, finalAmount),
      };
    }

    if (body.payment !== undefined) {
      const method = body.payment.method;
      const paymentStatus = body.payment.status;
      const hasMethod = method !== undefined;
      const hasStatus = paymentStatus !== undefined;
      if (hasMethod || hasStatus) {
        if (hasStatus) {
          (updates as Record<string, unknown>)["payment.status"] =
            paymentStatus === "paid" ? "paid" : "pending";
        }
        if (hasMethod) {
          const isOffline = method === "cash" || method === "card";
          (updates as Record<string, unknown>)["payment.method"] = method ?? null;
          (updates as Record<string, unknown>)["payment.initiatedByStaff"] = staffId;
          (updates as Record<string, unknown>)["payment.stripePaymentIntentId"] =
            body.payment.stripePaymentIntentId ?? null;
          (updates as Record<string, unknown>)["payment.paidAt"] =
            isOffline ? now : (body.payment.paidAt ?? null);
        }
      }
    }

    if (body.feedbackRequired !== undefined) {
      updates.feedbackRequired = !!body.feedbackRequired;
    }

    if (Object.keys(updates).length <= 1) {
      res.status(400).json({ message: "No valid fields to update" });
      return;
    }

    await db.update.findOneAndUpdate({
      req,
      connectionString,
      collection: "bookings",
      query,
      update: { $set: updates },
    });

    const nextStatus = typeof body.status === "string" ? body.status : previousStatus;
    const shouldSendConfirmationEmail =
      previousStatus === "pending" && nextStatus === "confirmed";
    const shouldSendCancellationEmail =
      previousStatus === "pending" && nextStatus === "cancelled";

    if (
      (shouldSendConfirmationEmail || shouldSendCancellationEmail) &&
      typeof existingBooking.customerName === "string" &&
      existingBooking.customerName.trim() &&
      existingBooking.bookingDate instanceof Date &&
      typeof existingBooking.sectionName === "string" &&
      existingBooking.sectionName.trim() &&
      typeof existingBooking.slot?.startTime === "string" &&
      existingBooking.slot.startTime.trim() &&
      typeof existingBooking.slot?.endTime === "string" &&
      existingBooking.slot.endTime.trim()
    ) {


      
      const emailPayload = {
        customerEmail: existingBooking.customerEmail?.trim(),
        customerId:
          existingBooking.userId instanceof ObjectId
            ? existingBooking.userId.toString()
            : existingBooking.userId?.toString(),
        customerName: existingBooking.customerName.trim(),
        bookingId: id,
        bookingDate: formatBookingDate(existingBooking.bookingDate),
        startTime: existingBooking.slot.startTime.trim(),
        endTime: existingBooking.slot.endTime.trim(),
        guests:
          typeof existingBooking.guestCount === "number"
            ? existingBooking.guestCount
            : 0,
        section: existingBooking.sectionName.trim(),
        venueName: "The Sheesha Factory",
        location: "RS Puram, Coimbatore",
      };

      if (shouldSendConfirmationEmail) {
        void sendBookingConfirmationEmail(emailPayload).catch((error) => {
          console.error("[admin-booking] Booking confirmation email failed", error);
        });

        void sendAdminBookingConfirmationEmail(req, emailPayload).catch((error) => {
          console.error("[admin-booking] Admin booking confirmation email failed", error);
        });
      }

      if (shouldSendCancellationEmail) {
        void sendBookingCancellationEmail(emailPayload).catch((error) => {
          console.error("[admin-booking] Booking cancellation email failed", error);
        });

        void sendAdminBookingCancellationEmail(req, emailPayload).catch((error) => {
          console.error("[admin-booking] Admin booking cancellation email failed", error);
        });
      }
    }

    res.status(200).json({ message: "Booking updated" });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

const WALK_IN_OFFLINE_USER = "Offline user";

/**
 * POST /admin/bookings/walk-in — create a minimal booking for walk-in/offline user payment (no prior booking).
 */
export async function postWalkInPaymentHandler(req: Request, res: Response): Promise<void> {
  try {
    const staff = req.user;
    if (!staff?.id) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const staffId = staff.id instanceof ObjectId ? staff.id : new ObjectId((staff.id as string).toString());
    const body = req.body as {
      billing?: { actualAmount?: number; discountAmount?: number; finalAmount?: number };
      payment?: { status?: "pending" | "paid"; method?: "stripe" | "cash" | "card" };
      feedbackRequired?: boolean;
    };
    const actual = Number(body.billing?.actualAmount ?? 0);
    const discount = Number(body.billing?.discountAmount ?? 0);
    const finalAmount =
      typeof body.billing?.finalAmount === "number"
        ? body.billing.finalAmount
        : Math.max(0, (Number.isFinite(actual) ? actual : 0) - (Number.isFinite(discount) ? discount : 0));
    const method = body.payment?.method ?? "cash";
    const isOffline = method === "cash" || method === "card";
    const now = new Date();
    const doc = {
      userId: null,
      customerName: WALK_IN_OFFLINE_USER,
      customerPhone: undefined,
      customerEmail: undefined,
      bookingDate: now,
      sectionId: null,
      sectionName: "Walk-in",
      slot: { startTime: "", endTime: "" },
      guestCount: 0,
      status: "completed",
      coupon: null,
      billing: {
        actualAmount: Number.isFinite(actual) ? actual : 0,
        discountAmount: Number.isFinite(discount) ? discount : 0,
        finalAmount: Math.max(0, finalAmount),
      },
      payment: {
        status: isOffline ? "paid" : (body.payment?.status ?? "pending"),
        method: method ?? null,
        initiatedByStaff: staffId,
        stripePaymentIntentId: null,
        paidAt: isOffline ? now : null,
      },
      feedbackRequired: !!body.feedbackRequired,
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
    res.status(201).json({ message: "Walk-in payment recorded" });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}
