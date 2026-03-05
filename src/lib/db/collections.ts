import type { Db } from "mongodb";
import type { UserDocument } from "./types";

const USERS_COLLECTION = "users";

export function getUsersCollection(db: Db) {
  return db.collection<UserDocument>(USERS_COLLECTION);
}

export async function ensureUsersIndexes(db: Db): Promise<void> {
  const coll = getUsersCollection(db);
  await coll.createIndex({ firebaseUid: 1 }, { unique: true });
  await coll.createIndex({ email: 1 }, { unique: true });
}
