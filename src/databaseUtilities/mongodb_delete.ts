import type { Request } from "express";
import { dbTables } from "./constants/databaseConstants";

function getDb(req: Request, connectionString: string): import("mongodb").Db {
  const db = req.app.locals[connectionString + "DB"];
  if (!db) throw new Error("Database not attached to app.locals.");
  return db as import("mongodb").Db;
}

export async function deleteOne(params: {
  req: Request;
  connectionString: string;
  collection: keyof typeof dbTables;
  query: Record<string, unknown>;
  options?: Record<string, unknown>;
}) {
  const { req, connectionString, collection, query, options = {} } = params;
  const db = getDb(req, connectionString);
  const colName = dbTables[collection];
  if (!colName) throw new Error(`Invalid collection name: ${String(collection)}`);
  const col = db.collection(colName);
  const result = await col.deleteOne(
    query as import("mongodb").Filter<import("mongodb").Document>,
    options as import("mongodb").DeleteOptions
  );
  return result;
}

export async function deleteMany(params: {
  req: Request;
  connectionString: string;
  collection: keyof typeof dbTables;
  query: Record<string, unknown>;
  options?: Record<string, unknown>;
}) {
  const { req, connectionString, collection, query, options = {} } = params;
  const db = getDb(req, connectionString);
  const colName = dbTables[collection];
  if (!colName) throw new Error(`Invalid collection name: ${String(collection)}`);
  const col = db.collection(colName);
  const result = await col.deleteMany(
    query as import("mongodb").Filter<import("mongodb").Document>,
    options as import("mongodb").DeleteOptions
  );
  return result;
}
