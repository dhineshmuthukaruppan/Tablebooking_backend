import type { Request } from "express";
import { dbTables } from "./constants/databaseConstants";

function getDb(req: Request, connectionString: string): import("mongodb").Db {
  const db = req.app.locals[connectionString + "DB"];
  if (!db) throw new Error("Database not attached to app.locals.");
  return db as import("mongodb").Db;
}

export async function insertOne(params: {
  req: Request;
  connectionString: string;
  collection: keyof typeof dbTables;
  payload: Record<string, unknown>;
  options?: Record<string, unknown>;
}) {
  const { req, connectionString, collection, payload, options = {} } = params;
  const db = getDb(req, connectionString);
  const colName = dbTables[collection];
  if (!colName) throw new Error(`Invalid collection name: ${String(collection)}`);
  const col = db.collection(colName);
  const result = await col.insertOne(payload as import("mongodb").Document, options as import("mongodb").InsertOneOptions);
  return result;
}

export async function insertMany(params: {
  req: Request;
  connectionString: string;
  collection: keyof typeof dbTables;
  docs: Record<string, unknown>[];
  options?: Record<string, unknown>;
}) {
  const { req, connectionString, collection, docs, options = {} } = params;
  const db = getDb(req, connectionString);
  const colName = dbTables[collection];
  if (!colName) throw new Error(`Invalid collection name: ${String(collection)}`);
  const col = db.collection(colName);
  const result = await col.insertMany(docs as import("mongodb").OptionalUnlessRequiredId<import("mongodb").Document>[], options as import("mongodb").BulkWriteOptions);
  return result;
}
