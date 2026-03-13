import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import db from "../../databaseUtilities";
import * as bookingSequence from "../../services/bookingSequence";

const ADMIN_BOOKING_STATUSES = ["pending", "confirmed", "completed", "noshow", "cancelled"] as const;
type AdminBookingStatus = (typeof ADMIN_BOOKING_STATUSES)[number];

export interface AdminListBookingsBody {
  page?: number;
  limit?: number;
  status?: AdminBookingStatus[];
  bookingDate?: string; // YYYY-MM-DD
  name?: string;
  email?: string;
  phone?: string;
  guestCount?: number;
  section?: string[];
  feedback?: "given" | "required";
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

    // bookingDate filter – single day range
    if (typeof body.bookingDate === "string" && body.bookingDate.trim()) {
      const dateStr = body.bookingDate.trim();
      const start = new Date(`${dateStr}T00:00:00.000Z`);
      const end = new Date(`${dateStr}T23:59:59.999Z`);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        query.bookingDate = { $gte: start, $lte: end };
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

    const projection = {
      _id: 1,
      bookingNumber: 1,
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

    res.status(200).json({ message: "Booking updated" });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

const WALK_IN_OFFLINE_USER = "Offline user";

/**
 * POST /admin/bookings/walk-in — create a minimal booking for walk-in/offline user payment (no prior booking).
 * Optional body: bookingDate, sectionId, slotStartTime, slotEndTime, guestCount, sectionName — when provided,
 * the walk-in booking is stored with that slot (for dashboard). Slot_inventory is updated at allocation time (POST table-allocations), not here.
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
      customerName?: string;
      bookingDate?: string;
      sectionId?: string;
      slotStartTime?: string;
      slotEndTime?: string;
      guestCount?: number;
      sectionName?: string;
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
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const nowHHmm = `${hh}:${mm}`;
    const customerName =
      typeof body.customerName === "string" && body.customerName.trim()
        ? body.customerName.trim()
        : WALK_IN_OFFLINE_USER;

    let bookingDate: Date = now;
    let sectionId: ObjectId | null = null;
    let slotStartTime = nowHHmm;
    let slotEndTime = nowHHmm;
    let guestCount = 0;
    let sectionName = "Walk-in";

    const hasSlotParams =
      typeof body.bookingDate === "string" &&
      body.bookingDate.trim().length >= 10 &&
      typeof body.sectionId === "string" &&
      body.sectionId.trim() !== "" &&
      typeof body.slotStartTime === "string" &&
      body.slotStartTime.trim() !== "" &&
      typeof body.slotEndTime === "string" &&
      body.slotEndTime.trim() !== "" &&
      typeof body.guestCount === "number" &&
      body.guestCount >= 0;

    if (hasSlotParams) {
      const dateStr = body.bookingDate!.trim().slice(0, 10);
      const parsedDate = new Date(dateStr + "T00:00:00.000Z");
      if (Number.isNaN(parsedDate.getTime())) {
        res.status(400).json({ message: "Invalid bookingDate" });
        return;
      }
      bookingDate = parsedDate;
      try {
        sectionId = new ObjectId(body.sectionId!.trim());
      } catch {
        res.status(400).json({ message: "Invalid sectionId" });
        return;
      }
      slotStartTime = body.slotStartTime!.trim();
      slotEndTime = body.slotEndTime!.trim();
      guestCount = Math.min(999, Math.max(0, Math.floor(body.guestCount!)));
      sectionName =
        typeof body.sectionName === "string" && body.sectionName.trim()
          ? body.sectionName.trim()
          : "Walk-in";
    }

    const bookingNumber = await bookingSequence.getNextBookingNumber(req);
    const doc = {
      bookingNumber,
      userId: null,
      customerName,
      customerPhone: undefined,
      customerEmail: undefined,
      bookingDate,
      sectionId,
      sectionName,
      slot: { startTime: slotStartTime, endTime: slotEndTime },
      guestCount,
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
