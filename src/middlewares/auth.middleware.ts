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
    const phoneNumber = decoded.phone_number ?? null;
    const connectionString = db.constants.connectionStrings.tableBooking;

    let user = await db.read.findOne({
      req,
      connectionString,
      collection: "users",
      query: { firebaseUid: decoded.uid },
    }) as UserDocument | null;
    const isEmailVerified = Boolean(decoded.email_verified);
    const isPhoneVerified = Boolean(phoneNumber);

    const authProvider: UserDocument["authProvider"] =
      phoneNumber && !email ? "phone" : "email";

    if (!user && email) {
      const now = new Date();
      const newUser: UserDocument = {
        firebaseUid: decoded.uid,
        email,
        phoneNumber,
        role: "user",
        isEmailVerified,
        isPhoneVerified,
        authProvider,
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
    } else if (user) {
      const updateFields: Partial<UserDocument> & { updatedAt: Date } = {
        updatedAt: new Date(),
      };

      let shouldUpdate = false;

      if (user.isEmailVerified !== isEmailVerified) {
        updateFields.isEmailVerified = isEmailVerified;
        shouldUpdate = true;
      }

      if (phoneNumber && user.phoneNumber !== phoneNumber) {
        updateFields.phoneNumber = phoneNumber;
        shouldUpdate = true;
      }

      if (user.isPhoneVerified !== isPhoneVerified) {
        updateFields.isPhoneVerified = isPhoneVerified;
        shouldUpdate = true;
      }

      if (!user.authProvider) {
        updateFields.authProvider = authProvider;
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        await db.update.updateOne({
          req,
          connectionString,
          collection: "users",
          query: { firebaseUid: decoded.uid },
          update: { $set: updateFields as Record<string, unknown> },
        });
        user = { ...user, ...updateFields };
      }
    }

    if (!user) {
      res.status(403).json({ message: "User profile not found" });
      return;
    }

    req.user = {
      id: user._id,
      uid: decoded.uid,
      email: decoded.email,
      phoneNumber: user.phoneNumber ?? phoneNumber,
      displayName: user.displayName,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      authProvider: user.authProvider ?? authProvider,
      isEligibleForCoupons: user.isEligibleForCoupons ?? false,
      createdAt: user.createdAt,
    };

    next();
  } catch (_error) {
    res.status(401).json({ message: "Invalid or expired authentication token" });
  }
}
