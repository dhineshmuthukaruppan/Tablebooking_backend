import type { Request } from "express";
import db from "../../databaseUtilities";
import type { UserDocument } from "../db/types";

export interface PhoneCredentialDocument {
  _id?: import("mongodb").ObjectId;
  phoneNumber: string;
  passwordHash: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const CONNECTION_STRING = db.constants.connectionStrings.tableBooking;

export async function findUserByFirebaseUid(
  req: Request,
  firebaseUid: string
): Promise<UserDocument | null> {
  return (await db.read.findOne({
    req,
    connectionString: CONNECTION_STRING,
    collection: "users",
    query: { firebaseUid },
  })) as UserDocument | null;
}

export async function findUserByPhoneNumber(
  req: Request,
  phoneNumber: string
): Promise<UserDocument | null> {
  return (await db.read.findOne({
    req,
    connectionString: CONNECTION_STRING,
    collection: "users",
    query: { phoneNumber },
  })) as UserDocument | null;
}

export async function insertUser(
  req: Request,
  payload: UserDocument
): Promise<void> {
  await db.create.insertOne({
    req,
    connectionString: CONNECTION_STRING,
    collection: "users",
    payload: payload as unknown as Record<string, unknown>,
  });
}

export async function updateUserByFirebaseUid(
  req: Request,
  firebaseUid: string,
  updateFields: Record<string, unknown>
): Promise<void> {
  await db.update.updateOne({
    req,
    connectionString: CONNECTION_STRING,
    collection: "users",
    query: { firebaseUid },
    update: { $set: updateFields },
  });
}

export async function findPhoneCredential(
  req: Request,
  phoneNumber: string
): Promise<PhoneCredentialDocument | null> {
  return (await db.read.findOne({
    req,
    connectionString: CONNECTION_STRING,
    collection: "phone_credentials",
    query: { phoneNumber },
  })) as PhoneCredentialDocument | null;
}

export async function upsertPhoneCredential(
  req: Request,
  params: { phoneNumber: string; passwordHash: string; now: Date }
): Promise<void> {
  const { phoneNumber, passwordHash, now } = params;

  await db.update.updateOne({
    req,
    connectionString: CONNECTION_STRING,
    collection: "phone_credentials",
    query: { phoneNumber },
    update: {
      $set: {
        phoneNumber,
        passwordHash,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    options: { upsert: true },
  });
}
