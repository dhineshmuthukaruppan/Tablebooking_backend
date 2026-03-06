import { MongoClient } from "mongodb";
import { env } from "./env";
import { logger } from "./logger";
import { ensureUsersIndexes } from "../lib/db/collections";

let client: MongoClient | null = null;
let db: import("mongodb").Db | null = null;

export async function connectDatabase(): Promise<void> {
  const c = new MongoClient(env.MONGODB_URI);
  await c.connect();
  client = c;
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

export function getClient(): MongoClient {
  if (!client) {
    throw new Error("Database not connected. Call connectDatabase() first.");
  }
  return client;
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logger.info("MongoDB connection closed");
  }
}
