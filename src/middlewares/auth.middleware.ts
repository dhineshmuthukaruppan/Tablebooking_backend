import type { NextFunction, Request, Response } from "express";
import { firebaseAdminAuth } from "../config/firebase-admin";
import { getDb } from "../config/database";
import { getUsersCollection } from "../lib/db/collections";
import type { UserDocument } from "../lib/db/types";

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      res.status(401).json({ message: "Missing Bearer token" });
      return;
    }

    const decoded = await firebaseAdminAuth.verifyIdToken(token);
    const email = (decoded.email ?? "").toLowerCase().trim();

    const database = getDb();
    const usersColl = getUsersCollection(database);

    let user = await usersColl.findOne({ firebaseUid: decoded.uid });
    const isEmailVerified = Boolean(decoded.email_verified);

    if (!user && email) {
      const now = new Date();
      const newUser: UserDocument = {
        firebaseUid: decoded.uid,
        email,
        role: "user",
        isEmailVerified,
        isEligibleForCoupons: false,
        createdAt: now,
        updatedAt: now,
      };
      await usersColl.insertOne(newUser as UserDocument & { _id?: import("mongodb").ObjectId });
      user = await usersColl.findOne({ firebaseUid: decoded.uid });
    } else if (user && user.isEmailVerified !== isEmailVerified) {
      await usersColl.updateOne(
        { firebaseUid: decoded.uid },
        { $set: { isEmailVerified, updatedAt: new Date() } }
      );
      user = { ...user, isEmailVerified, updatedAt: new Date() };
    }

    if (!user) {
      res.status(403).json({ message: "User profile not found" });
      return;
    }

    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isEligibleForCoupons: user.isEligibleForCoupons ?? false,
    };

    next();
  } catch (_error) {
    res.status(401).json({ message: "Invalid or expired authentication token" });
  }
}
