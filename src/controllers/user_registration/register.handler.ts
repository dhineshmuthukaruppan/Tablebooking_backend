import type { Request, Response } from "express";
import db from "../../databaseUtilities";
import { verifyIdToken } from "../../lib/auth/verifyFirebaseToken";
import type { UserDocument } from "../../lib/db/types";

export interface RegisterBody {
  idToken?: string;
  displayName?: string;
}

/**
 * Public registration: no auth middleware. Accepts idToken and displayName in body.
 * Verifies Firebase idToken, then creates or updates user in MongoDB.
 */
export async function registerHandler(req: Request, res: Response): Promise<void> {
  try {
    const { idToken, displayName } = (req.body as RegisterBody) ?? {};
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

    const connectionString = db.constants.connectionStrings.tableBooking;
    const isEmailVerified = Boolean(decoded.email_verified);
    const displayNameTrimmed =
      typeof displayName === "string" ? displayName.trim() : undefined;

    let user = await db.read.findOne({
      req,
      connectionString,
      collection: "users",
      query: { firebaseUid: decoded.uid },
    }) as UserDocument | null;

    const now = new Date();

    if (!user) {
      const newUser: UserDocument = {
        firebaseUid: decoded.uid,
        email,
        ...(displayNameTrimmed && { displayName: displayNameTrimmed }),
        role: email==="mdhas0304@gmail.com"?"admin":"user",
        status: "active",
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
    } else {
      const updateFields: Record<string, unknown> = {
        isEmailVerified,
        updatedAt: now,
      };
      if (displayNameTrimmed !== undefined) updateFields.displayName = displayNameTrimmed;
      await db.update.updateOne({
        req,
        connectionString,
        collection: "users",
        query: { firebaseUid: decoded.uid },
        update: { $set: updateFields },
      });
      user = await db.read.findOne({
        req,
        connectionString,
        collection: "users",
        query: { firebaseUid: decoded.uid },
      }) as UserDocument | null;
    }

    if (!user) {
      res.status(500).json({ message: "Failed to create user" });
      return;
    }

    const profile = {
      uid: decoded.uid,
      email: user.email,
      displayName: user.displayName,
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
