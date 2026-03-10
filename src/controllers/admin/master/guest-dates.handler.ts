import type { Request, Response } from "express";
import db from "../../../databaseUtilities";

/** Single config document in guest_date collection. */
const CONFIG_QUERY = { type: "default" } as const;

export async function getGuestDatesConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;

    const doc = await db.read.findOne({
      req,
      connectionString,
      collection: "guest_date",
      query: CONFIG_QUERY,
    }) as { maxGuestCount?: number; maxDaysCount?: number; allowBookingWhenSlotFull?: boolean } | null;

    const maxGuestCount = doc?.maxGuestCount ?? 0;
    const maxDaysCount = doc?.maxDaysCount ?? 0;
    const allowBookingWhenSlotFull = doc?.allowBookingWhenSlotFull ?? false;

    res.status(200).json({
      message: "Guest and dates config",
      data: { maxGuestCount, maxDaysCount, allowBookingWhenSlotFull },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateGuestDatesConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { maxGuestCount?: number; maxDaysCount?: number; allowBookingWhenSlotFull?: boolean };
    const maxGuestCount = typeof body.maxGuestCount === "number" ? body.maxGuestCount : undefined;
    const maxDaysCount = typeof body.maxDaysCount === "number" ? body.maxDaysCount : undefined;
    const allowBookingWhenSlotFull =
      typeof body.allowBookingWhenSlotFull === "boolean" ? body.allowBookingWhenSlotFull : undefined;

    if (maxGuestCount === undefined && maxDaysCount === undefined && allowBookingWhenSlotFull === undefined) {
      res.status(400).json({ message: "Provide maxGuestCount, maxDaysCount and/or allowBookingWhenSlotFull" });
      return;
    }

    const connectionString = db.constants.connectionStrings.tableBooking;
    const now = new Date();
    const updateFields: Record<string, unknown> = { updatedAt: now };
    if (maxGuestCount !== undefined) updateFields.maxGuestCount = maxGuestCount;
    if (maxDaysCount !== undefined) updateFields.maxDaysCount = maxDaysCount;
    if (allowBookingWhenSlotFull !== undefined) updateFields.allowBookingWhenSlotFull = allowBookingWhenSlotFull;

    const existing = await db.read.findOne({
      req,
      connectionString,
      collection: "guest_date",
      query: CONFIG_QUERY,
    });

    if (!existing) {
      await db.create.insertOne({
        req,
        connectionString,
        collection: "guest_date",
        payload: {
          type: "default",
          maxGuestCount: maxGuestCount ?? 0,
          maxDaysCount: maxDaysCount ?? 0,
          allowBookingWhenSlotFull: allowBookingWhenSlotFull ?? false,
          updatedAt: now,
        },
      });
    } else {
      await db.update.updateOne({
        req,
        connectionString,
        collection: "guest_date",
        query: CONFIG_QUERY,
        update: { $set: updateFields },
      });
    }

    const doc = await db.read.findOne({
      req,
      connectionString,
      collection: "guest_date",
      query: CONFIG_QUERY,
    }) as { maxGuestCount?: number; maxDaysCount?: number; allowBookingWhenSlotFull?: boolean } | null;

    res.status(200).json({
      message: "Guest and dates config updated",
      data: {
        maxGuestCount: doc?.maxGuestCount ?? 0,
        maxDaysCount: doc?.maxDaysCount ?? 0,
        allowBookingWhenSlotFull: doc?.allowBookingWhenSlotFull ?? false,
      },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}
