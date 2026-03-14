/**
 * Database utilities – single import for all MongoDB operations.
 * Use like: const db = require('./databaseUtilities'); await db.read.findOne({ req, connectionString, collection, query });
 */
import * as mongodbRead from "./mongodb_read";
import * as mongodbCreate from "./mongodb_create";
import * as mongodbUpdate from "./mongodb_update";
import * as mongodbDelete from "./mongodb_delete";
import { dbTables, connectionStrings } from "./constants/databaseConstants";

export const read = {
  findOne: mongodbRead.findOne,
  find: mongodbRead.find,
  count: mongodbRead.count,
};

export const create = {
  insertOne: mongodbCreate.insertOne,
  insertMany: mongodbCreate.insertMany,
};

export const update = {
  updateOne: mongodbUpdate.updateOne,
  updateMany: mongodbUpdate.updateMany,
  findOneAndUpdate: mongodbUpdate.findOneAndUpdate,
};

export const deleteOp = {
  deleteOne: mongodbDelete.deleteOne,
  deleteMany: mongodbDelete.deleteMany,
};

export const constants = {
  dbTables,
  connectionStrings,
};

export default { read, create, update, deleteOp, constants };