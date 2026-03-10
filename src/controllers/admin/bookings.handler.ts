import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import db from "../../databaseUtilities";

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
      updates.payment = {
        status: body.status === "completed" ? "pending" : null,
      };
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
      const isOffline = method === "cash" || method === "card";
      const paymentStatus = isOffline ? "paid" : (body.payment.status ?? "pending");
      updates.payment = {
        status: paymentStatus,
        method: method ?? null,
        initiatedByStaff: staffId,
        stripePaymentIntentId: body.payment.stripePaymentIntentId ?? null,
        paidAt: isOffline ? now : (body.payment.paidAt ?? null),
      };
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
