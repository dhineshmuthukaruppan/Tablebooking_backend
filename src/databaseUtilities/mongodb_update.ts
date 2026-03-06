import type { Request } from "express";
import { dbTables } from "./constants/databaseConstants";

function getDb(req: Request, connectionString: string): import("mongodb").Db {
  const db = req.app.locals[connectionString + "DB"];
  if (!db) throw new Error("Database not attached to app.locals.");
  return db as import("mongodb").Db;
}

export async function updateOne(params: {
  req: Request;
  connectionString: string;
  collection: keyof typeof dbTables;
  query: Record<string, unknown>;
  update: Record<string, unknown>;
  options?: Record<string, unknown>;
}) {
  const { req, connectionString, collection, query, update, options = {} } = params;
  const db = getDb(req, connectionString);
  const colName = dbTables[collection];
  if (!colName) throw new Error(`Invalid collection name: ${String(collection)}`);
  const col = db.collection(colName);
  const result = await col.updateOne(
    query as import("mongodb").Filter<import("mongodb").Document>,
    update as import("mongodb").UpdateFilter<import("mongodb").Document>,
    options as import("mongodb").UpdateOptions
  );
  return result;
}

export async function updateMany(params: {
  req: Request;
  connectionString: string;
  collection: keyof typeof dbTables;
  query: Record<string, unknown>;
  update: Record<string, unknown>;
  options?: Record<string, unknown>;
}) {
  const { req, connectionString, collection, query, update, options = {} } = params;
  const db = getDb(req, connectionString);
  const colName = dbTables[collection];
  if (!colName) throw new Error(`Invalid collection name: ${String(collection)}`);
  const col = db.collection(colName);
  const result = await col.updateMany(
    query as import("mongodb").Filter<import("mongodb").Document>,
    update as import("mongodb").UpdateFilter<import("mongodb").Document>,
    options as import("mongodb").UpdateOptions
  );
  return result;
}

export async function findOneAndUpdate(params: {
  req: Request;
  connectionString: string;
  collection: keyof typeof dbTables;
  query: Record<string, unknown>;
  update: Record<string, unknown>;
  options?: Record<string, unknown>;
}) {
  const { req, connectionString, collection, query, update, options = {} } = params;
  const db = getDb(req, connectionString);
  const colName = dbTables[collection];
  if (!colName) throw new Error(`Invalid collection name: ${String(collection)}`);
  const col = db.collection(colName);
  const result = await col.findOneAndUpdate(
    query as import("mongodb").Filter<import("mongodb").Document>,
    update as import("mongodb").UpdateFilter<import("mongodb").Document>,
    options as import("mongodb").FindOneAndUpdateOptions
  );
  return result ?? null;
}
