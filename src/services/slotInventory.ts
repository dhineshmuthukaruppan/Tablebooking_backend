import type { Request } from "express";
import type { ObjectId } from "mongodb";
import db from "../databaseUtilities";

const CONNECTION_STRING = db.constants.connectionStrings.tableBooking;
const TABLE_MASTER_CONFIG_ID = "config";
const DEFAULT_TOTAL_SEATS = 10;

/**
 * Get total_seats from table_master document. Returns integer; defaults to DEFAULT_TOTAL_SEATS if missing.
 */
export async function getTotalSeatsFromTableMaster(req: Request): Promise<number> {
  const doc = await db.read.findOne({
    req,
    connectionString: CONNECTION_STRING,
    collection: "table_master",
    query: { _id: TABLE_MASTER_CONFIG_ID },
  });
  const totalSeats = (doc as { total_seats?: number } | null)?.total_seats;
  if (typeof totalSeats === "number" && !Number.isNaN(totalSeats) && totalSeats >= 0) {
    return Math.floor(totalSeats);
  }
  return DEFAULT_TOTAL_SEATS;
}

export interface EnsureSlotInventoryParams {
  req: Request;
  bookingDate: Date;
  sectionId: ObjectId;
  slotStartTime: string;
  slotEndTime: string;
  totalSeats: number;
}

/**
 * Ensure a slot_inventory document exists (lazy). Uses upsert with $setOnInsert so concurrent calls are safe.
 */
export async function ensureSlotInventory(params: EnsureSlotInventoryParams): Promise<void> {
  const { req, bookingDate, sectionId, slotStartTime, slotEndTime, totalSeats } = params;
  await db.update.updateOne({
    req,
    connectionString: CONNECTION_STRING,
    collection: "slot_inventory",
    query: {
      bookingDate,
      sectionId,
      slotStartTime,
      slotEndTime,
    },
    update: {
      $setOnInsert: {
        totalSeats,
        bookedSeats: 0,
        remainingSeats: totalSeats,
      },
    },
    options: { upsert: true },
  });
}

export interface AllocateSeatsParams {
  req: Request;
  bookingDate: Date;
  sectionId: ObjectId;
  slotStartTime: string;
  slotEndTime: string;
  guestCount: number;
}

/**
 * Atomically allocate seats. Returns true if allocation succeeded, false if not enough remaining seats.
 */
export async function allocateSeats(params: AllocateSeatsParams): Promise<boolean> {
  const { req, bookingDate, sectionId, slotStartTime, slotEndTime, guestCount } = params;
  const result = await db.update.updateOne({
    req,
    connectionString: CONNECTION_STRING,
    collection: "slot_inventory",
    query: {
      bookingDate,
      sectionId,
      slotStartTime,
      slotEndTime,
      remainingSeats: { $gte: guestCount },
    },
    update: {
      $inc: { bookedSeats: guestCount, remainingSeats: -guestCount },
    },
  });
  return (result.modifiedCount ?? 0) > 0;
}

export interface ReleaseSeatsParams {
  req: Request;
  bookingDate: Date;
  sectionId: ObjectId;
  slotStartTime: string;
  slotEndTime: string;
  guestCount: number;
}

/**
 * Release seats on cancel. Uses $inc to decrement bookedSeats and increment remainingSeats.
 */
export async function releaseSeats(params: ReleaseSeatsParams): Promise<void> {
  const { req, bookingDate, sectionId, slotStartTime, slotEndTime, guestCount } = params;
  await db.update.updateOne({
    req,
    connectionString: CONNECTION_STRING,
    collection: "slot_inventory",
    query: {
      bookingDate,
      sectionId,
      slotStartTime,
      slotEndTime,
    },
    update: {
      $inc: { bookedSeats: -guestCount, remainingSeats: guestCount },
    },
  });
}

/**
 * Get remainingSeats for a slot (for error message "Available only for N guests").
 */
export async function getRemainingSeats(
  req: Request,
  bookingDate: Date,
  sectionId: ObjectId,
  slotStartTime: string,
  slotEndTime: string
): Promise<number> {
  const doc = await db.read.findOne({
    req,
    connectionString: CONNECTION_STRING,
    collection: "slot_inventory",
    query: {
      bookingDate,
      sectionId,
      slotStartTime,
      slotEndTime,
    },
  });
  const remaining = (doc as { remainingSeats?: number } | null)?.remainingSeats;
  return typeof remaining === "number" && !Number.isNaN(remaining) ? Math.max(0, remaining) : 0;
}
