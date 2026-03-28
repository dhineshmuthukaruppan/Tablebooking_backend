import type { Db } from "mongodb";
import type { UserDocument } from "./types";
import { dbTables } from "../../databaseUtilities/constants/databaseConstants";

const USERS_COLLECTION = "users";

export function getUsersCollection(db: Db) {
  return db.collection<UserDocument>(USERS_COLLECTION);
}

export async function ensureUsersIndexes(db: Db): Promise<void> {
  const coll = getUsersCollection(db);
  await coll.createIndex({ firebaseUid: 1 }, { unique: true });

  const indexes = await coll.indexes();
  const legacyEmailIndex = indexes.find((index) => index.name === "email_1");
  if (legacyEmailIndex) {
    await coll.dropIndex("email_1");
  }

  await coll.updateMany(
    { $or: [{ email: "" }, { email: null }] },
    { $unset: { email: "" } }
  );

  await coll.createIndex(
    { email: 1 },
    {
      unique: true,
      name: "email_1",
      partialFilterExpression: {
        email: { $type: "string" },
      },
    }
  );

  await coll.updateMany(
    {
      $or: [{ phoneNumber: null }, { phoneNumber: "" }],
    },
    { $unset: { phoneNumber: "" } }
  );

  // Backfill safety: if legacy data has duplicate phone numbers,
  // keep the newest record and clear phoneNumber on older duplicates
  // so unique index creation does not fail at startup.
  const duplicatePhones = await coll
    .aggregate<{ _id: string; ids: unknown[] }>([
      { $match: { phoneNumber: { $type: "string" } } },
      { $sort: { updatedAt: -1, _id: -1 } },
      {
        $group: {
          _id: "$phoneNumber",
          ids: { $push: "$_id" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  for (const dup of duplicatePhones) {
    const idsToUnset = dup.ids.slice(1);
    if (idsToUnset.length > 0) {
      await coll.updateMany(
        { _id: { $in: idsToUnset } },
        { $unset: { phoneNumber: "" } }
      );
    }
  }

  await coll.createIndex(
    { phoneNumber: 1 },
    {
      unique: true,
      name: "phoneNumber_1",
      partialFilterExpression: {
        phoneNumber: { $type: "string" },
      },
    }
  );
}

export async function ensureBookingsIndexes(db: Db): Promise<void> {
  const coll = db.collection(dbTables.bookings);
  await coll.createIndex({ sectionId: 1, bookingDate: 1 });
}

export async function ensureSlotInventoryIndexes(db: Db): Promise<void> {
  const coll = db.collection(dbTables.slot_inventory);
  await coll.createIndex(
    { bookingDate: 1, sectionId: 1, slotStartTime: 1, slotEndTime: 1 },
    { unique: true }
  );
}

export async function ensureMealTimeMasterSlotConfigIndex(db: Db): Promise<void> {
  const coll = db.collection(dbTables.meal_time_master);
  await coll.createIndex({ _id: 1, "slotConfigs.effectiveFrom": -1 });
}

export async function ensureTableAllocationsIndexes(db: Db): Promise<void> {
  const coll = db.collection(dbTables.table_allocations);
  await coll.createIndex(
    { allocationDate: 1, tableKey: 1, bookingId: 1 },
    { unique: true }
  );
  await coll.createIndex({ allocationDate: 1, bookingId: 1 });
}

export async function ensureAllIndexes(db: Db): Promise<void> {
  await ensureUsersIndexes(db);
  await ensureBookingsIndexes(db);
  await ensureSlotInventoryIndexes(db);
  await ensureMealTimeMasterSlotConfigIndex(db);
  await ensureTableAllocationsIndexes(db);
}

/**
 * Daily cleanup: delete slot_inventory documents where bookingDate < today.
 * Call from cron or scheduled job.
 */
export async function runSlotInventoryCleanup(db: Db): Promise<{ deletedCount: number }> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const coll = db.collection(dbTables.slot_inventory);
  const result = await coll.deleteMany({ bookingDate: { $lt: today } });
  return { deletedCount: result.deletedCount };
}
