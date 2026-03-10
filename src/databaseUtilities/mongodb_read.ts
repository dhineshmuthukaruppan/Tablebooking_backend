import type { Request } from "express";
import { dbTables } from "./constants/databaseConstants";

function getDb(req: Request, connectionString: string): import("mongodb").Db {
  const db = req.app.locals[connectionString + "DB"];
  if (!db) throw new Error("Database not attached to app.locals.");
  return db as import("mongodb").Db;
}

export async function findOne(params: {
  req: Request;
  connectionString: string;
  collection: keyof typeof dbTables;
  query: Record<string, unknown>;
  projection?: Record<string, unknown>;
  sort?: Record<string, unknown>;
  options?: Record<string, unknown>;
}) {
  const { req, connectionString, collection, query, projection, sort, options = {} } = params;
  const db = getDb(req, connectionString);
  const colName = dbTables[collection];
  if (!colName) throw new Error(`Invalid collection name: ${String(collection)}`);
  const col = db.collection(colName);
  const queryOptions: Record<string, unknown> = { ...options };
  if (projection !== undefined) queryOptions.projection = projection;
  if (sort !== undefined) queryOptions.sort = sort;
  const result = await col.findOne(query as import("mongodb").Filter<import("mongodb").Document>, queryOptions as import("mongodb").FindOptions<import("mongodb").Document>);
  return result;
}

export async function find(params: {
  req: Request;
  connectionString: string;
  collection: keyof typeof dbTables;
  query: Record<string, unknown>;
  projection?: Record<string, unknown>;
  sort?: Record<string, unknown>;
  skip?: number;
  limit?: number;
  options?: Record<string, unknown>;
}) {
  const { req, connectionString, collection, query, projection, sort, skip, limit, options = {} } = params;
  const db = getDb(req, connectionString);
  const colName = dbTables[collection];
  if (!colName) throw new Error(`Invalid collection name: ${String(collection)}`);
  const col = db.collection(colName);
  let cursor = col.find(query as import("mongodb").Filter<import("mongodb").Document>);
  if (projection) cursor = cursor.project(projection as import("mongodb").Document);
  if (sort) cursor = cursor.sort(sort as import("mongodb").Sort);
  if (skip !== undefined) cursor = cursor.skip(skip);
  if (limit !== undefined) cursor = cursor.limit(limit);
  const resultArray = await cursor.toArray();
  return resultArray;
}

export async function count(params: {
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
  const count = await col.countDocuments(query as import("mongodb").Filter<import("mongodb").Document>, options as import("mongodb").CountDocumentsOptions);
  return count;
}
