import type { Request, Response } from "express";
import { MongoClient, ObjectId } from "mongodb";
import db from "../../databaseUtilities";
import { getAdminEmail } from "../../lib/getAdminEmail";
import {
  sendAdminBookingCancellationEmail,
  sendAdminBookingConfirmationEmail,
  sendBookingCancellationEmail,
  sendBookingConfirmationEmail,
} from "../../services/email/email.service";
import * as bookingSequence from "../../services/bookingSequence";

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

/** Build MongoDB query from admin list/export body (shared by list and export). */
function buildAdminBookingsQuery(body: AdminListBookingsBody): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  const statusArr = Array.isArray(body.status) ? body.status : [];
  const validStatuses = statusArr.filter((s) => ADMIN_BOOKING_STATUSES.includes(s as AdminBookingStatus));
  if (validStatuses.length > 0) {
    query.status = { $in: validStatuses };
  }

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

  if (typeof body.name === "string" && body.name.trim()) {
    query.customerName = { $regex: body.name.trim(), $options: "i" };
  }
  if (typeof body.email === "string" && body.email.trim()) {
    query.customerEmail = { $regex: body.email.trim(), $options: "i" };
  }
  if (typeof body.phone === "string" && body.phone.trim()) {
    query.customerPhone = { $regex: body.phone.trim(), $options: "i" };
  }

  if (typeof body.guestCount === "number" && Number.isFinite(body.guestCount) && body.guestCount > 0) {
    query.guestCount = body.guestCount;
  }

  const sectionsArr = Array.isArray(body.section) ? body.section.filter((s) => typeof s === "string" && s.trim()) : [];
  if (sectionsArr.length > 0) {
    query.sectionName = { $in: sectionsArr };
  }

  if (body.feedback === "given") {
    query.feedback = { $ne: null };
  } else if (body.feedback === "required") {
    query.feedbackRequired = true;
  }

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

  return query;
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
    // When filtering by specific slots, we still want enough rows for the UI.
    // Keep an upper cap to avoid heavy queries.
    const limit = Math.min(500, Math.max(1, Number(body.limit) || 20));
    const skip = (page - 1) * limit;

    const connectionString = db.constants.connectionStrings.tableBooking;
    const query = buildAdminBookingsQuery(body);

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
      coupon: 1,
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

const EXPORT_MAX_ROWS = 50_000;

function escapeCsvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatDateExport(v: string | Date | null | undefined): string {
  if (v == null) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * POST /admin/bookings/export — admin/staff export all filtered bookings as CSV (no pagination).
 */
export async function exportAdminBookingsHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = (req.body as AdminListBookingsBody) ?? {};
    const connectionString = db.constants.connectionStrings.tableBooking;
    const query = buildAdminBookingsQuery(body);

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
      createdAt: 1,
      updatedAt: 1,
    };

    const items = await db.read.find({
      req,
      connectionString,
      collection: "bookings",
      query,
      projection,
      sort: { createdAt: -1 },
      skip: 0,
      limit: EXPORT_MAX_ROWS,
    });

    type Row = {
      _id?: string;
      bookingNumber?: number;
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      bookingDate?: string;
      sectionName?: string;
      slot?: { startTime?: string; endTime?: string };
      guestCount?: number;
      status?: string;
      payment?: { status?: string; method?: string } | null;
      createdAt?: string;
      updatedAt?: string;
    };
    const rows: Row[] = (items ?? []) as unknown as Row[];

    const headers = [
      "Booking ID",
      "Name",
      "Email",
      "Phone",
      "Booking date",
      "Guest count",
      "Slot start",
      "Slot end",
      "Section",
      "Status",
      "Payment status",
      "Payment method",
      "Created at",
      "Updated at",
    ];
    const headerLine = headers.map(escapeCsvCell).join(",");

    const dataLines = rows.map((r) => {
      const slotStart = r.slot?.startTime ?? "";
      const slotEnd = r.slot?.endTime ?? "";
      const bookingId = r.bookingNumber != null ? String(r.bookingNumber) : (r._id ?? "");
      const paymentStatus = r.payment?.status ?? "";
      const paymentMethod = r.payment?.method ?? "";
      return [
        escapeCsvCell(bookingId),
        escapeCsvCell(r.customerName),
        escapeCsvCell(r.customerEmail),
        escapeCsvCell(r.customerPhone),
        escapeCsvCell(formatDateExport(r.bookingDate)),
        escapeCsvCell(r.guestCount),
        escapeCsvCell(slotStart),
        escapeCsvCell(slotEnd),
        escapeCsvCell(r.sectionName),
        escapeCsvCell(r.status),
        escapeCsvCell(paymentStatus),
        escapeCsvCell(paymentMethod),
        escapeCsvCell(formatDateExport(r.createdAt)),
        escapeCsvCell(formatDateExport(r.updatedAt)),
      ].join(",");
    });

    const bom = "\uFEFF";
    const csv = bom + headerLine + "\n" + dataLines.join("\n");

    const filename = `bookings_export_${formatDateExport(new Date()).replace(/-/g, "")}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(csv);
  } catch {
    res.status(500).json({ message: "Export failed" });
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
      billing?: { actualAmount?: number; discountAmount?: number; finalAmount?: number; customDiscount?: boolean };
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
      payment?: { status?: "pending" | "paid" | null };
      // feedback?: unknown | null;
      coupon?: {
        couponId?: ObjectId;
        couponCode?: string;
        isReserved?: boolean;
        reservedAt?: Date | null;
        isRedeemed?: boolean;
        redeemedAt?: Date | null;
        appliedPercentage?: number;
      } | null;
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
      console.log("body.status", body.status);
      updates.status = body.status;
      updates.feedbackRequired = body.status === "completed";
      console.log("body.status === completed", body.status === "completed");
      console.log("updates.feedbackRequired", updates.feedbackRequired);
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
      const customDiscount = body.billing.customDiscount;
      updates.billing = {
        actualAmount: Number.isFinite(actual) ? actual : 0,
        discountAmount: Number.isFinite(discount) ? discount : 0,
        finalAmount: Math.max(0, finalAmount),
        ...(customDiscount !== undefined ? { customDiscount: !!customDiscount } : {}),
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

    // Transaction: update booking and (optionally) redeem coupon + increment coupon totalUsed
    const dbConn = (req.app.locals as Record<string, unknown>)[connectionString + "DB"] as import("mongodb").Db | undefined;
    const client = (req.app.locals as Record<string, unknown>)[connectionString + "CLIENT"] as MongoClient | undefined;
    if (!dbConn || !client) {
      res.status(500).json({ message: "Database not available" });
      return;
    }

    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const bookingCol = dbConn.collection("bookings");
        const couponsCol = dbConn.collection(db.constants.dbTables.coupons);
        const redeemsCol = dbConn.collection("redeems");

        const booking = (await bookingCol.findOne(query, { session })) as typeof existingBooking;
        if (!booking?._id) {
          throw new Error("Booking not found");
        }

    //     const isPaidUpdate = body.payment?.status === "paid";
    //     const coupon = booking.coupon ?? null;
    //     const canRedeem =
    //       isPaidUpdate &&
    //       coupon?.isReserved === true &&
    //       coupon?.isRedeemed !== true &&
    //       coupon?.couponId instanceof ObjectId &&
    //       booking.feedback != null;

        const txUpdates: Record<string, unknown> = { ...updates };
    //     if (canRedeem) {
    //       (txUpdates as Record<string, unknown>)["coupon.isRedeemed"] = true;
    //       (txUpdates as Record<string, unknown>)["coupon.redeemedAt"] = now;
    //     }

        await bookingCol.updateOne(query, { $set: txUpdates }, { session });

    //     if (canRedeem) {
    //       await couponsCol.updateOne(
    //         { _id: coupon!.couponId as ObjectId },
    //         { $inc: { totalUsed: 1 }, $set: { updatedAt: now } },
    //         { session }
    //       );

    //       await redeemsCol.insertOne(
    //         {
    //           couponId: coupon!.couponId as ObjectId,
    //           userId: booking.userId as ObjectId,
    //           bookingId: booking._id as ObjectId,
    //           redeemedAt: now,
    //         },
    //         { session }
    //       );
    //     }
      });
    } finally {
      await session.endSession();
    }

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

      const ADMIN_EMAIL = await getAdminEmail(req, connectionString);
      const emailPayload = {
        customerEmail: existingBooking.customerEmail?.trim(),
        adminEmail: ADMIN_EMAIL ?? undefined,
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
      billing?: { actualAmount?: number; discountAmount?: number; finalAmount?: number; customDiscount?: boolean };
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
    const customDiscount = body.billing?.customDiscount;
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
        ...(customDiscount !== undefined ? { customDiscount: !!customDiscount } : {}),
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
