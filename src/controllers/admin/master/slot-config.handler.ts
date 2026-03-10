import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import db from "../../../databaseUtilities";

/**
 * Start of today 00:00:00 UTC.
 */
function getTodayStart(): Date {
  const iso = new Date().toISOString().slice(0, 10);
  return new Date(iso + "T00:00:00.000Z");
}

/**
 * POST /admin/master/slot-config/preview
 * Body: sectionId, startTime, endTime, slotDuration.
 * Returns existingBookingsUntil, effectiveFrom, message.
 */
export async function previewSlotConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      sectionId?: string;
      startTime?: string;
      endTime?: string;
      slotDuration?: number | string;
    };
    const sectionIdStr = typeof body.sectionId === "string" ? body.sectionId.trim() : "";
    if (!sectionIdStr || !ObjectId.isValid(sectionIdStr)) {
      res.status(400).json({ message: "Valid sectionId is required" });
      return;
    }
    const sectionId = new ObjectId(sectionIdStr);
    const connectionString = db.constants.connectionStrings.tableBooking;
    const today = getTodayStart();

    const list = await db.read.find({
      req,
      connectionString,
      collection: "bookings",
      query: {
        sectionId,
        bookingDate: { $gte: today },
        status: { $in: ["pending", "confirmed"] },
      },
      sort: { bookingDate: -1 },
      limit: 1,
    });
    const lastFuture = Array.isArray(list) && list.length > 0 ? list[0] : null;

    const lastBookingDate = (lastFuture as { bookingDate?: Date } | null)?.bookingDate ?? null;
    let effectiveFrom: Date;
    if (!lastBookingDate) {
      effectiveFrom = today;
    } else {
      const nextDay = new Date(lastBookingDate);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      nextDay.setUTCHours(0, 0, 0, 0);
      effectiveFrom = nextDay.getTime() > today.getTime() ? nextDay : today;
    }

    const effectiveFromStr = effectiveFrom.toISOString().slice(0, 10);
    const existingStr = lastBookingDate ? lastBookingDate.toISOString().slice(0, 10) : null;
    const message = existingStr
      ? `Existing bookings exist until ${existingStr}. New slot configuration will apply from ${effectiveFromStr}.`
      : `No future bookings. New slot configuration will apply from ${effectiveFromStr}.`;

    res.status(200).json({
      message: "Preview",
      data: {
        existingBookingsUntil: lastBookingDate,
        effectiveFrom,
        message,
      },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * POST /admin/master/slot-config
 * Body: sectionId, startTime, endTime, slotDuration, slotDurationType?, effectiveFrom (optional; if not provided use preview logic).
 * Pushes new slotConfig to meal_time_master.slotConfigs. Never updates existing configs.
 */
export async function createSlotConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      sectionId?: string;
      startTime?: string;
      endTime?: string;
      slotDuration?: number | string;
      slotDurationType?: string;
      effectiveFrom?: string;
    };
    const sectionIdStr = typeof body.sectionId === "string" ? body.sectionId.trim() : "";
    const startTime = typeof body.startTime === "string" ? body.startTime.trim() : "";
    const endTime = typeof body.endTime === "string" ? body.endTime.trim() : "";
    const slotDurationRaw = body.slotDuration;
    const slotDuration =
      typeof slotDurationRaw === "number"
        ? Math.max(1, Math.floor(slotDurationRaw))
        : Math.max(1, parseInt(String(slotDurationRaw ?? "60"), 10) || 60);
    const slotDurationType = typeof body.slotDurationType === "string" ? body.slotDurationType : "minutes";

    if (!sectionIdStr || !ObjectId.isValid(sectionIdStr)) {
      res.status(400).json({ message: "Valid sectionId is required" });
      return;
    }
    if (!startTime || !endTime) {
      res.status(400).json({ message: "startTime and endTime are required" });
      return;
    }

    const sectionId = new ObjectId(sectionIdStr);
    const connectionString = db.constants.connectionStrings.tableBooking;

    let effectiveFrom: Date;
    if (typeof body.effectiveFrom === "string" && body.effectiveFrom.trim()) {
      effectiveFrom = new Date(body.effectiveFrom.trim());
      if (Number.isNaN(effectiveFrom.getTime())) {
        res.status(400).json({ message: "Invalid effectiveFrom date" });
        return;
      }
      effectiveFrom.setUTCHours(0, 0, 0, 0);
    } else {
      const today = getTodayStart();
      const list = await db.read.find({
        req,
        connectionString,
        collection: "bookings",
        query: {
          sectionId,
          bookingDate: { $gte: today },
          status: { $in: ["pending", "confirmed"] },
        },
        sort: { bookingDate: -1 },
        limit: 1,
      });
      const lastFuture = Array.isArray(list) && list.length > 0 ? list[0] : null;
      const lastBookingDate = (lastFuture as { bookingDate?: Date } | null)?.bookingDate ?? null;
      if (!lastBookingDate) {
        effectiveFrom = today;
      } else {
        const nextDay = new Date(lastBookingDate);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        nextDay.setUTCHours(0, 0, 0, 0);
        effectiveFrom = nextDay.getTime() > today.getTime() ? nextDay : today;
      }
    }

    const now = new Date();
    const newConfig = {
      startTime,
      endTime,
      slotDuration,
      slotDurationType,
      effectiveFrom,
      createdAt: now,
    };

    await db.update.updateOne({
      req,
      connectionString,
      collection: "meal_time_master",
      query: { _id: sectionId },
      update: { $push: { slotConfigs: newConfig } },
    });

    res.status(201).json({
      message: "Slot configuration added",
      data: { sectionId: sectionIdStr, effectiveFrom, slotConfig: newConfig },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}
