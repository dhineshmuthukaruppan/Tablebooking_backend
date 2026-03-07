import type { Request, Response } from "express";
import db from "../../../databaseUtilities";

export interface MealTimeSection {
  _id?: string;
  sectionName: string;
  startTime: string;   // HH:mm
  endTime: string;     // HH:mm
  slotDuration: string; // "1", "1.5", "2", "2.5" or custom minutes as string
  slotDurationType: "preset" | "custom";
  isActive: boolean;
  description?: string;
  createdOn?: Date;
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

    const slotDuration = typeof body.slotDuration === "string" ? body.slotDuration.trim() : "";
    const slotDurationType = body.slotDurationType === "custom" ? "custom" : "preset";
    if (!slotDuration) {
      res.status(400).json({ message: "Slot duration is required" });
      return;
    }

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
