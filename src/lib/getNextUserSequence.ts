import type { Request } from "express";
import db from "../databaseUtilities";

const USER_COUNTER_ID = "userSeq";

/**
 * Returns the next sequential user number (1, 2, 3, ...) for role "user"
 * and increments the shared counter in the "counters" collection.
 *
 * Uses document shape: { _id: "userSeq", seq: number }.
 * Atomic via findOneAndUpdate with $inc and upsert to avoid race conditions.
 */
export async function getNextUserSequence(
  req: Request,
  connectionString: string
): Promise<number> {
  const result = await db.update.findOneAndUpdate({
    req,
    connectionString,
    collection: "counters",
    query: { _id: USER_COUNTER_ID },
    update: { $inc: { seq: 1 } },
    options: { upsert: true, returnDocument: "after" as const },
  });

  const doc = result as { seq?: number } | null;
  const seq = doc?.seq;
  return typeof seq === "number" && Number.isFinite(seq) ? seq : 1;
}

