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

export async function getMealTimeListHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;

    const list = (await db.read.find({
      req,
      connectionString,
      collection: "meal_time_master",
      query: {},
      sort: { createdOn: -1 },
    })) as unknown as MealTimeSection[];

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
    res.status(200).json({ message: "Meal time section", data: doc });
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
    const update: Record<string, unknown> = {
      sectionName,
      startTime,
      endTime,
      slotDuration,
      slotDurationType,
      isActive,
      updatedOn: new Date(),
    };
    if (description !== undefined) update.description = description;

    await db.update.updateOne({
      req,
      connectionString,
      collection: "meal_time_master",
      query: { _id: new ObjectId(id) },
      update: { $set: update },
    });

    res.status(200).json({ message: "Meal time section updated", data: { _id: id, ...update } });
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
