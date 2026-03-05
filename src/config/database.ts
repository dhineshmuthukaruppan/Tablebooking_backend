import { MongoClient } from "mongodb";
import { env } from "./env";
import { logger } from "./logger";
import { ensureUsersIndexes } from "../lib/db/collections";

let client: MongoClient;
let db: import("mongodb").Db | null = null;

export async function connectDatabase(): Promise<void> {
  client = new MongoClient(env.MONGODB_URI);
  await client.connect();
  db = client.db();
  await ensureUsersIndexes(db);
  logger.info("MongoDB connected");
}

export function getDb(): import("mongodb").Db {
  if (!db) {
    throw new Error("Database not connected. Call connectDatabase() first.");
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.close();
    db = null;
    logger.info("MongoDB connection closed");
  }
}
