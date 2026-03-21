import type { Request } from "express";
import db from "../databaseUtilities";

const connectionString = db.constants.connectionStrings.tableBooking;
const GENERAL_MASTER_COLLECTION = "general_master";
const USERS_COLLECTION = "users";
const CONFIG_QUERY = { type: "default" } as const;

export interface GeneralMasterConfigDocument {
  type: "default";
  maxGuestCount?: number;
  maxDaysCount?: number;
  allowBookingWhenSlotFull?: boolean;
  adminEmail?: string;
  updatedAt?: Date;
}

export interface AdminContactUserDocument {
  email?: string | null;
  role: string;
  isSystemAdmin?: boolean;
  createdAt?: Date;
}

export async function findGeneralMasterConfig(
  req: Request
): Promise<GeneralMasterConfigDocument | null> {
  return (await db.read.findOne({
    req,
    connectionString,
    collection: GENERAL_MASTER_COLLECTION,
    query: CONFIG_QUERY,
  })) as GeneralMasterConfigDocument | null;
}

export async function upsertGeneralMasterConfig(
  req: Request,
  updateFields: Partial<GeneralMasterConfigDocument>
): Promise<GeneralMasterConfigDocument | null> {
  await db.update.findOneAndUpdate({
    req,
    connectionString,
    collection: GENERAL_MASTER_COLLECTION,
    query: CONFIG_QUERY,
    update: {
      $set: updateFields,
      $setOnInsert: {
        type: "default",
      },
    },
    options: { upsert: true },
  });

  return findGeneralMasterConfig(req);
}

export async function findAdminUserByEmail(
  req: Request,
  email: string
): Promise<AdminContactUserDocument | null> {
  return (await db.read.findOne({
    req,
    connectionString,
    collection: USERS_COLLECTION,
    query: {
      email,
      role: "admin",
    },
    projection: {
      email: 1,
      role: 1,
      isSystemAdmin: 1,
      createdAt: 1,
    },
  })) as AdminContactUserDocument | null;
}

export async function findFirstSystemAdminUser(
  req: Request
): Promise<AdminContactUserDocument | null> {
  const docs = (await db.read.find({
    req,
    connectionString,
    collection: USERS_COLLECTION,
    query: {
      role: "admin",
      isSystemAdmin: true,
      email: { $exists: true, $nin: [null, ""] },
    },
    projection: {
      email: 1,
      role: 1,
      isSystemAdmin: 1,
      createdAt: 1,
    },
    sort: { createdAt: -1 },
    limit: 1,
  })) as unknown as AdminContactUserDocument[] | null;

  return docs?.[0] ?? null;
}
