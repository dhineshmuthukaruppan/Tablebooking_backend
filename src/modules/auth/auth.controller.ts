import type { Request, Response } from "express";
import { firebaseAdminAuth } from "../../config/firebase-admin";
import { getDb } from "../../config/database";
import { getUsersCollection } from "../../lib/db/collections";
import type { UserDocument } from "../../lib/db/types";

export interface RegisterSigninBody {
  idToken?: string;
}

async function verifyIdTokenAndGetDecoded(idToken: string | undefined) {
  if (!idToken || typeof idToken !== "string") {
    return null;
  }
  return firebaseAdminAuth.verifyIdToken(idToken);
}

/**
 * POST /auth/register
 * Body: { idToken }. Verifies Firebase token and creates/upserts user in MongoDB.
 */
export async function registerHandler(req: Request, res: Response): Promise<void> {
  try {
    const { idToken } = (req.body as RegisterSigninBody) ?? {};
    const decoded = await verifyIdTokenAndGetDecoded(idToken);
    if (!decoded) {
      res.status(401).json({ message: "Invalid or missing idToken" });
      return;
    }

    const email = (decoded.email ?? "").toLowerCase().trim();
    if (!email) {
      res.status(400).json({ message: "Email is required" });
      return;
    }

    const db = getDb();
    const usersColl = getUsersCollection(db);
    const isEmailVerified = Boolean(decoded.email_verified);

    let user = await usersColl.findOne({ firebaseUid: decoded.uid });
    const now = new Date();

    if (!user) {
      const newUser: UserDocument = {
        firebaseUid: decoded.uid,
        email,
        role: "user",
        isEmailVerified,
        isEligibleForCoupons: false,
        createdAt: now,
        updatedAt: now,
      };
      await usersColl.insertOne(
        newUser as UserDocument & { _id?: import("mongodb").ObjectId }
      );
      user = await usersColl.findOne({ firebaseUid: decoded.uid });
    } else {
      await usersColl.updateOne(
        { firebaseUid: decoded.uid },
        { $set: { isEmailVerified, updatedAt: now } }
      );
      user = await usersColl.findOne({ firebaseUid: decoded.uid });
    }

    if (!user) {
      res.status(500).json({ message: "Failed to create user" });
      return;
    }

    const profile = {
      uid: decoded.uid,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isEligibleForCoupons: user.isEligibleForCoupons ?? false,
    };

    res.status(201).json({
      message: "User registered successfully",
      data: profile,
    });
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired authentication token" });
  }
}

/**
 * POST /auth/signin
 * Body: { idToken }. Verifies Firebase token and ensures user exists in MongoDB.
 * Returns 403 if user is not in MongoDB (must register first).
 */
export async function signinHandler(req: Request, res: Response): Promise<void> {
  try {
    const { idToken } = (req.body as RegisterSigninBody) ?? {};
    const decoded = await verifyIdTokenAndGetDecoded(idToken);
    if (!decoded) {
      res.status(401).json({ message: "Invalid or missing idToken" });
      return;
    }

    const db = getDb();
    const usersColl = getUsersCollection(db);
    let user = await usersColl.findOne({ firebaseUid: decoded.uid });

    if (!user) {
      res.status(403).json({
        message: "User not found. Please register first.",
      });
      return;
    }

    const isEmailVerified = Boolean(decoded.email_verified);
    if (user.isEmailVerified !== isEmailVerified) {
      await usersColl.updateOne(
        { firebaseUid: decoded.uid },
        { $set: { isEmailVerified, updatedAt: new Date() } }
      );
      user = { ...user, isEmailVerified };
    }

    const profile = {
      uid: decoded.uid,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isEligibleForCoupons: user.isEligibleForCoupons ?? false,
    };

    res.status(200).json({
      message: "Signed in successfully",
      data: profile,
    });
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired authentication token" });
  }
}
