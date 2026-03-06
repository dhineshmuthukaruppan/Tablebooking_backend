import type { Request, Response } from "express";
import { getDb } from "../../config/database";
import { getUsersCollection } from "../../lib/db/collections";
import type { UserDocument } from "../../lib/db/types";
import { verifyIdToken } from "../../lib/auth/verifyFirebaseToken";

export interface RegisterBody {
  idToken?: string;
}

export async function registerHandler(req: Request, res: Response): Promise<void> {
  try {
    const { idToken } = (req.body as RegisterBody) ?? {};
    const decoded = await verifyIdToken(idToken);
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
  } catch {
    res.status(401).json({ message: "Invalid or expired authentication token" });
  }
}
