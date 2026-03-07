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
    }) as { maxGuestCount?: number; maxDaysCount?: number } | null;

    const maxGuestCount = doc?.maxGuestCount ?? 0;
    const maxDaysCount = doc?.maxDaysCount ?? 0;

    res.status(200).json({
      message: "Guest and dates config",
      data: { maxGuestCount, maxDaysCount },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateGuestDatesConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { maxGuestCount?: number; maxDaysCount?: number };
    const maxGuestCount = typeof body.maxGuestCount === "number" ? body.maxGuestCount : undefined;
    const maxDaysCount = typeof body.maxDaysCount === "number" ? body.maxDaysCount : undefined;

    if (maxGuestCount === undefined && maxDaysCount === undefined) {
      res.status(400).json({ message: "Provide maxGuestCount and/or maxDaysCount" });
      return;
    }

    const connectionString = db.constants.connectionStrings.tableBooking;
    const now = new Date();
    const updateFields: Record<string, unknown> = { updatedAt: now };
    if (maxGuestCount !== undefined) updateFields.maxGuestCount = maxGuestCount;
    if (maxDaysCount !== undefined) updateFields.maxDaysCount = maxDaysCount;

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
    }) as { maxGuestCount?: number; maxDaysCount?: number } | null;

    res.status(200).json({
      message: "Guest and dates config updated",
      data: {
        maxGuestCount: doc?.maxGuestCount ?? 0,
        maxDaysCount: doc?.maxDaysCount ?? 0,
      },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}
