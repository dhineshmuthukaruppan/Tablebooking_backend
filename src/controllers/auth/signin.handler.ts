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
    }) as { _id?: import("mongodb").ObjectId; email: string; displayName?: string; role: string; status?: string; isEmailVerified: boolean; isEligibleForCoupons?: boolean; createdAt?: Date } | null;

    if (!user) {
      res.status(403).json({
        message: "User not found. Please register first.",
      });
      return;
    }

    if (user.status === "inactive") {
      res.status(403).json({
        message: "You are inactive. Please contact admin to login.",
      });
      return;
    }

    const isEmailVerified = Boolean(decoded.email_verified);
    if (user.isEmailVerified !== isEmailVerified) {
      await db.update.updateOne({
        req,
        connectionString,
        collection: "users",
        query: { firebaseUid: decoded.uid },
        update: { $set: { isEmailVerified, updatedAt: new Date() } },
      });
      user = { ...user, isEmailVerified };
    }

    if (!user.isEmailVerified) {
      res.status(403).json({
        message: "Please verify the email to sign in.",
      });
      return;
    }

    const profile = {
      id: user._id?.toString(),
      uid: decoded.uid,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
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
