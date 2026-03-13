import type { Request } from "express";
import db from "../databaseUtilities";

const COUNTER_ID = "bookingSeq";

/**
 * Returns the next sequential booking number (1, 2, 3, ...) and increments the counter.
 * Uses the "counters" collection with document { _id: "bookingSeq", seq: number }.
 */
export async function getNextBookingNumber(req: Request): Promise<number> {
  const result = await db.update.findOneAndUpdate({
    req,
    connectionString: db.constants.connectionStrings.tableBooking,
    collection: "counters",
    query: { _id: COUNTER_ID },
    update: { $inc: { seq: 1 } },
    options: { upsert: true, returnDocument: "after" as const },
  });
  const doc = result as { seq?: number } | null;
  const seq = doc?.seq;
  return typeof seq === "number" && Number.isFinite(seq) ? seq : 1;
}
