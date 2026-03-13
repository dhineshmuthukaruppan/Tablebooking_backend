import type { Request, Response } from "express";
import db from "../../databaseUtilities";
import { verifyIdToken } from "../../lib/auth/verifyFirebaseToken";

export interface SigninBody {
  idToken?: string;
}

export async function signinHandler(req: Request, res: Response): Promise<void> {
  try {
    const { idToken } = (req.body as SigninBody) ?? {};
    const hasToken = Boolean(idToken && typeof idToken === "string");
    console.log("[signin] idToken present:", hasToken);
    const decoded = await verifyIdToken(idToken);
    if (!decoded) {
      console.log("[signin] 401: invalid or missing idToken");
      res.status(401).json({ message: "Invalid or missing idToken" });
      return;
    }

    const connectionString = db.constants.connectionStrings.tableBooking;

    let user = await db.read.findOne({
      req,
      connectionString,
      collection: "users",
      query: { firebaseUid: decoded.uid },
    }) as {
      _id?: import("mongodb").ObjectId;
      email: string;
      phoneNumber?: string | null;
      displayName?: string;
      role: string;
      isEmailVerified: boolean;
      isPhoneVerified?: boolean;
      isEligibleForCoupons?: boolean;
      createdAt?: Date;
    } | null;

    if (!user) {
      res.status(403).json({
        message: "User not found. Please register first.",
      });
      return;
    }

    const isEmailVerified = Boolean(decoded.email_verified);
    const phoneNumber = decoded.phone_number ?? null;
    const isPhoneVerified = Boolean(phoneNumber);

    const updateFields: Record<string, unknown> = { updatedAt: new Date() };
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

    if (shouldUpdate) {
      await db.update.updateOne({
        req,
        connectionString,
        collection: "users",
        query: { firebaseUid: decoded.uid },
        update: { $set: updateFields },
      });
      user = { ...user, ...updateFields };
    }

    const profile = {
      id: user._id?.toString(),
      uid: decoded.uid,
      email: user.email,
      phoneNumber: user.phoneNumber,
      displayName: user.displayName,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      isEligibleForCoupons: user.isEligibleForCoupons ?? false,
      createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : (user.createdAt as string | undefined),
    };

    res.status(200).json({
      message: "Signed in successfully",
      data: profile,
    });
  } catch (err) {
    console.log("[signin] 401: verify or DB error", err instanceof Error ? err.message : "unknown");
    res.status(401).json({ message: "Invalid or expired authentication token" });
  }
}
