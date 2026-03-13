import type { NextFunction, Request, Response } from "express";
import { firebaseAdminAuth } from "../config/firebase-admin";
import db from "../databaseUtilities";
import type { UserDocument } from "../lib/db/types";

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer") ? authHeader.slice(7) : null;

    if (!token) {
      res.status(401).json({ message: "Missing Bearer token" });
      return;
    }

    const decoded = await firebaseAdminAuth.verifyIdToken(token);
    const email = (decoded.email ?? "").toLowerCase().trim();
    const connectionString = db.constants.connectionStrings.tableBooking;

    let user = await db.read.findOne({
      req,
      connectionString,
      collection: "users",
      query: { firebaseUid: decoded.uid },
    }) as UserDocument | null;
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
      await db.create.insertOne({
        req,
        connectionString,
        collection: "users",
        payload: newUser as unknown as Record<string, unknown>,
      });
      user = await db.read.findOne({
        req,
        connectionString,
        collection: "users",
        query: { firebaseUid: decoded.uid },
      }) as UserDocument | null;
    } else if (user && user.isEmailVerified !== isEmailVerified) {
      await db.update.updateOne({
        req,
        connectionString,
        collection: "users",
        query: { firebaseUid: decoded.uid },
        update: { $set: { isEmailVerified, updatedAt: new Date() } },
      });
      user = { ...user, isEmailVerified, updatedAt: new Date() };
    }

    if (!user) {
      res.status(403).json({ message: "User profile not found" });
      return;
    }

    req.user = {
      id: user._id,
      uid: decoded.uid,
      email: decoded.email,
      displayName: user.displayName,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isEligibleForCoupons: user.isEligibleForCoupons ?? false,
      createdAt: user.createdAt,
    };

    next();
  } catch (_error) {
    res.status(401).json({ message: "Invalid or expired authentication token" });
  }
}
