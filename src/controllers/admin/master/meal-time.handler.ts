import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import db from "../../../databaseUtilities";

export interface MealTimeSection {
  _id?: string;
  sectionName: string;
  startTime: string;   // HH:mm
  endTime: string;     // HH:mm
  slotDuration: string; // stored as minutes, e.g. "60", "90", "45"
  slotDurationType: "preset" | "custom";
  isActive: boolean;
  description?: string;
  createdOn?: Date;
}

/** Start of today 00:00:00 UTC. */
function getTodayStart(): Date {
  const iso = new Date().toISOString().slice(0, 10);
  return new Date(iso + "T00:00:00.000Z");
}

/** Convert incoming slotDuration to stored minutes (string). Preset: "1"->60, "1.5"->90, etc. Custom: use as minutes. */
function toStoredSlotMinutes(slotDuration: string, slotDurationType: string): string {
  const trimmed = String(slotDuration ?? "").trim();
  if (slotDurationType === "custom") {
    const num = Math.round(parseFloat(trimmed) || 0);
    return String(Math.max(1, num));
  }
  const hours = parseFloat(trimmed);
  if (Number.isNaN(hours)) return "60";
  const minutes = Math.round(hours * 60);
  return String(Math.max(1, minutes));
}

/** Convert to number (minutes) for slotConfigs. */
function slotDurationToNumber(slotDuration: string | number): number {
  if (typeof slotDuration === "number" && !Number.isNaN(slotDuration)) return Math.max(1, Math.floor(slotDuration));
  return Math.max(1, parseInt(String(slotDuration ?? "60"), 10) || 60);
}

export async function getMealTimeListHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;

    const list = (await db.read.find({
      req,
      connectionString,
      collection: "meal_time_master",
      query: {},
      sort: { createdOn: -1 },
    })) as unknown as Array<Record<string, unknown>>;

    list.forEach(sortSlotConfigsByEffectiveFromDesc);

    res.status(200).json({
      message: "Meal time sections",
      data: list,
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function addMealTimeHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      sectionName?: string;
      startTime?: string;
      endTime?: string;
      slotDuration?: string;
      slotDurationType?: "preset" | "custom";
      isActive?: boolean;
      description?: string;
    };

    const sectionName = typeof body.sectionName === "string" ? body.sectionName.trim() : "";
    if (!sectionName) {
      res.status(400).json({ message: "Section name is required" });
      return;
    }

    const startTime = typeof body.startTime === "string" ? body.startTime : "";
    const endTime = typeof body.endTime === "string" ? body.endTime : "";
    if (!startTime || !endTime) {
      res.status(400).json({ message: "Start time and end time are required" });
      return;
    }

    const slotDurationRaw = typeof body.slotDuration === "string" ? body.slotDuration.trim() : "";
    const slotDurationType = body.slotDurationType === "custom" ? "custom" : "preset";
    if (!slotDurationRaw) {
      res.status(400).json({ message: "Slot duration is required" });
      return;
    }
    const slotDuration = toStoredSlotMinutes(slotDurationRaw, slotDurationType);

    const isActive = body.isActive !== false;
    const description = typeof body.description === "string" ? body.description.trim() : undefined;

    const connectionString = db.constants.connectionStrings.tableBooking;
    const now = new Date();

    const payload: Record<string, unknown> = {
      sectionName,
      startTime,
      endTime,
      slotDuration,
      slotDurationType,
      isActive,
      createdOn: now,
    };
    if (description !== undefined) payload.description = description;

    await db.create.insertOne({
      req,
      connectionString,
      collection: "meal_time_master",
      payload,
    });

    res.status(201).json({
      message: "Meal time section added",
      data: { sectionName, startTime, endTime, slotDuration, slotDurationType, isActive, description, createdOn: now },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

function sortSlotConfigsByEffectiveFromDesc(doc: Record<string, unknown>): void {
  const configs = doc.slotConfigs;
  if (!Array.isArray(configs)) {
    doc.slotConfigs = [];
    return;
  }
  (configs as Array<{ effectiveFrom?: Date }>).sort((a, b) => {
    const da = (a.effectiveFrom && new Date(a.effectiveFrom).getTime()) || 0;
    const db = (b.effectiveFrom && new Date(b.effectiveFrom).getTime()) || 0;
    return db - da;
  });
}

export async function getMealTimeByIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || typeof id !== "string" || !ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid id" });
      return;
    }
    const connectionString = db.constants.connectionStrings.tableBooking;
    const doc = await db.read.findOne({
      req,
      connectionString,
      collection: "meal_time_master",
      query: { _id: new ObjectId(id) },
    });
    if (!doc) {
      res.status(404).json({ message: "Meal time section not found" });
      return;
    }
    const out = doc as Record<string, unknown>;
    sortSlotConfigsByEffectiveFromDesc(out);
    res.status(200).json({ message: "Meal time section", data: out });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateMealTimeHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || typeof id !== "string" || !ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid id" });
      return;
    }
    const body = req.body as {
      sectionName?: string;
      startTime?: string;
      endTime?: string;
      slotDuration?: string | number;
      slotDurationType?: "preset" | "custom";
      isActive?: boolean;
      description?: string;
      effectiveFrom?: string;
    };

    const sectionName = typeof body.sectionName === "string" ? body.sectionName.trim() : "";
    const startTime = typeof body.startTime === "string" ? body.startTime : "";
    const endTime = typeof body.endTime === "string" ? body.endTime : "";
    const hasSlotFields = !!(startTime && endTime && (body.slotDuration !== undefined && body.slotDuration !== ""));

    if (hasSlotFields && !sectionName) {
      res.status(400).json({ message: "Section name is required" });
      return;
    }

    const connectionString = db.constants.connectionStrings.tableBooking;
    const now = new Date();
    const sectionId = new ObjectId(id);

    if (hasSlotFields) {
      const slotDurationRaw = body.slotDuration;
      const slotDurationType = body.slotDurationType === "custom" ? "custom" : "preset";
      const slotDurationStr = toStoredSlotMinutes(
        typeof slotDurationRaw === "number" ? String(slotDurationRaw) : String(slotDurationRaw ?? ""),
        slotDurationType
      );
      const slotDurationNum = slotDurationToNumber(parseInt(slotDurationStr, 10) || 60);

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

      if (typeof body.effectiveFrom === "string" && body.effectiveFrom.trim()) {
        const userDate = new Date(body.effectiveFrom.trim());
        if (!Number.isNaN(userDate.getTime())) {
          userDate.setUTCHours(0, 0, 0, 0);
          if (userDate.getTime() >= effectiveFrom.getTime()) effectiveFrom = userDate;
        }
      }

      const newConfig = {
        startTime,
        endTime,
        slotDuration: slotDurationNum,
        slotDurationType,
        effectiveFrom,
        createdAt: now,
      };

      const update: Record<string, unknown> = { $push: { slotConfigs: newConfig }, $set: { updatedOn: now } };
      if (sectionName) (update.$set as Record<string, unknown>).sectionName = sectionName;
      if (body.isActive !== undefined) (update.$set as Record<string, unknown>).isActive = body.isActive !== false;
      if (body.description !== undefined) (update.$set as Record<string, unknown>).description = typeof body.description === "string" ? body.description.trim() : body.description;

      await db.update.updateOne({
        req,
        connectionString,
        collection: "meal_time_master",
        query: { _id: sectionId },
        update,
      });

      res.status(200).json({
        message: "Meal time section updated",
        data: { _id: id, effectiveFrom: effectiveFrom.toISOString().slice(0, 10), slotConfig: newConfig },
      });
      return;
    }

    if (!sectionName) {
      res.status(400).json({ message: "Section name is required when not updating slot configuration" });
      return;
    }
    const isActive = body.isActive !== false;
    const description = typeof body.description === "string" ? body.description.trim() : undefined;

    const setFields: Record<string, unknown> = {
      sectionName,
      isActive,
      updatedOn: now,
    };
    if (description !== undefined) setFields.description = description;

    await db.update.updateOne({
      req,
      connectionString,
      collection: "meal_time_master",
      query: { _id: sectionId },
      update: { $set: setFields },
    });

    res.status(200).json({ message: "Meal time section updated", data: { _id: id, ...setFields } });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteMealTimeHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || typeof id !== "string" || !ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid id" });
      return;
    }
    const connectionString = db.constants.connectionStrings.tableBooking;
    const col = (req.app.locals[connectionString + "DB"] as import("mongodb").Db).collection("meal_time_master");
    const result = await col.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      res.status(404).json({ message: "Meal time section not found" });
      return;
    }
    res.status(200).json({ message: "Meal time section deleted" });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}
