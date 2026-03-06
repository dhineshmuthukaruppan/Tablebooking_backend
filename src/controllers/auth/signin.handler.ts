import type { Request, Response } from "express";
import { getDb } from "../../config/database";
import { getUsersCollection } from "../../lib/db/collections";
import { verifyIdToken } from "../../lib/auth/verifyFirebaseToken";

export interface SigninBody {
  idToken?: string;
}

export async function signinHandler(req: Request, res: Response): Promise<void> {
  try {
    const { idToken } = (req.body as SigninBody) ?? {};
    const decoded = await verifyIdToken(idToken);
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
  } catch {
    res.status(401).json({ message: "Invalid or expired authentication token" });
  }
}
