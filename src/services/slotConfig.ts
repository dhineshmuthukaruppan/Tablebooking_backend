import type { Request } from "express";
import type { ObjectId } from "mongodb";
import db from "../databaseUtilities";

const CONNECTION_STRING = db.constants.connectionStrings.tableBooking;

export interface SlotConfigItem {
  startTime: string;
  endTime: string;
  slotDuration: number;
  slotDurationType?: string;
  effectiveFrom?: Date;
  createdAt?: Date;
}

export interface SlotConfigForDate {
  startTime: string;
  endTime: string;
  slotDuration: number;
  slotDurationType?: string;
  /** When config is from slotConfigs, the effectiveFrom date string (YYYY-MM-DD) for display. */
  effectiveFrom?: string;
}

export interface SlotRange {
  startTime: string;
  endTime: string;
}

/**
 * Parse time string "HH:mm" to minutes since midnight.
 */
function timeToMinutes(time: string): number {
  const parts = String(time).trim().split(":");
  const h = parseInt(parts[0] ?? "0", 10) || 0;
  const m = parseInt(parts[1] ?? "0", 10) || 0;
  return h * 60 + m;
}

/**
 * Format minutes since midnight to "HH:mm".
 */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Get the slot config effective for a given booking date from meal_time_master.
 * Uses slotConfigs array: filter effectiveFrom <= bookingDate, sort by effectiveFrom desc, take first.
 * Falls back to legacy root startTime, endTime, slotDuration if no slotConfigs or no match.
 */
export async function getSlotConfigForDate(
  req: Request,
  sectionId: ObjectId,
  bookingDate: Date
): Promise<SlotConfigForDate | null> {
  const doc = await db.read.findOne({
    req,
    connectionString: CONNECTION_STRING,
    collection: "meal_time_master",
    query: { _id: sectionId },
  });

  if (!doc) return null;

  const root = doc as {
    slotConfigs?: SlotConfigItem[];
    startTime?: string;
    endTime?: string;
    slotDuration?: string | number;
    slotDurationType?: string;
  };

  const dateOnly = new Date(bookingDate);
  dateOnly.setUTCHours(0, 0, 0, 0);

  const configs = Array.isArray(root.slotConfigs) ? root.slotConfigs : [];
  const effectiveConfigs = configs.filter((c) => {
    const ef = c.effectiveFrom;
    if (!ef) return false;
    const d = new Date(ef);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime() <= dateOnly.getTime();
  });
  effectiveConfigs.sort((a, b) => {
    const da = (a.effectiveFrom && new Date(a.effectiveFrom).getTime()) || 0;
    const db = (b.effectiveFrom && new Date(b.effectiveFrom).getTime()) || 0;
    return db - da;
  });

  const chosen = effectiveConfigs[0];
  if (chosen) {
    const duration =
      typeof chosen.slotDuration === "number"
        ? chosen.slotDuration
        : parseInt(String(chosen.slotDuration ?? "60"), 10) || 60;
    const effectiveFromStr = chosen.effectiveFrom
      ? new Date(chosen.effectiveFrom).toISOString().slice(0, 10)
      : undefined;
    return {
      startTime: String(chosen.startTime ?? ""),
      endTime: String(chosen.endTime ?? ""),
      slotDuration: Math.max(1, duration),
      slotDurationType: chosen.slotDurationType,
      effectiveFrom: effectiveFromStr,
    };
  }

  if (root.startTime && root.endTime) {
    const duration =
      typeof root.slotDuration === "number"
        ? root.slotDuration
        : parseInt(String(root.slotDuration ?? "60"), 10) || 60;
    return {
      startTime: String(root.startTime),
      endTime: String(root.endTime),
      slotDuration: Math.max(1, duration),
      slotDurationType: root.slotDurationType,
    };
  }

  return null;
}

/**
 * Generate slots from config: startTime, endTime, slotDuration (minutes).
 * Returns array of { startTime, endTime } in "HH:mm" format.
 */
export function generateSlotsFromConfig(config: SlotConfigForDate): SlotRange[] {
  const { startTime, endTime, slotDuration } = config;
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  const duration = Math.max(1, Math.floor(slotDuration));
  const slots: SlotRange[] = [];

  for (let t = startMin; t + duration <= endMin; t += duration) {
    slots.push({
      startTime: minutesToTime(t),
      endTime: minutesToTime(t + duration),
    });
  }
  // Include trailing partial slot when remaining time is less than full duration (e.g. section ends 12:25, last start 12:00, duration 30 → add 12:00–12:25)
  const lastEnd = slots.length > 0 ? timeToMinutes(slots[slots.length - 1].endTime) : startMin;
  if (lastEnd < endMin) {
    slots.push({
      startTime: minutesToTime(lastEnd),
      endTime: minutesToTime(endMin),
    });
  }
  return slots;
}
