import type { Request, Response } from "express";
import db from "../../databaseUtilities";
import { verifyIdToken } from "../../lib/auth/verifyFirebaseToken";
import type { UserDocument } from "../../lib/db/types";
import { logger } from "../../config/logger";

interface SigninBody {
  idToken?: string;
}

type SigninUpdateFields = Partial<
  Pick<UserDocument, "isEmailVerified" | "phoneNumber" | "isPhoneVerified" | "updatedAt">
>;

function buildSigninProfile(user: UserDocument, uid: string) {
  return {
    id: user._id?.toString(),
    uid,
    email: user.email,
    phoneNumber: user.phoneNumber,
    displayName: user.displayName,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    isPhoneVerified: user.isPhoneVerified,
    isEligibleForCoupons: user.isEligibleForCoupons ?? false,
    createdAt:
      user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
  };
}

export async function signinHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as SigninBody;
    const idToken = body?.idToken;

    if (!idToken || typeof idToken !== "string") {
      res.status(401).json({ message: "Invalid or missing idToken" });
      return;
    }

    const decoded = await verifyIdToken(idToken);
    if (!decoded) {
      res.status(401).json({ message: "Invalid authentication token" });
      return;
    }

    const connectionString = db.constants.connectionStrings.tableBooking;
    let user = (await db.read.findOne({
      req,
      connectionString,
      collection: "users",
      query: { firebaseUid: decoded.uid },
    })) as UserDocument | null;

    if (!user) {
      res.status(403).json({ message: "User not found. Please register first." });
      return;
    }

    if (user.status === "inactive") {
      res.status(403).json({
        message: "You are inactive. Please contact admin.",
      });
      return;
    }

    const nextEmailVerified = Boolean(decoded.email_verified);
    const nextPhoneNumber = decoded.phone_number ?? null;
    const nextPhoneVerified = Boolean(nextPhoneNumber);
    const updateFields: SigninUpdateFields = {};

    if (user.isEmailVerified !== nextEmailVerified) {
      updateFields.isEmailVerified = nextEmailVerified;
    }

    if (nextPhoneNumber && user.phoneNumber !== nextPhoneNumber) {
      updateFields.phoneNumber = nextPhoneNumber;
    }

    if (user.isPhoneVerified !== nextPhoneVerified) {
      updateFields.isPhoneVerified = nextPhoneVerified;
    }

    if (Object.keys(updateFields).length > 0) {
      updateFields.updatedAt = new Date();

      await db.update.updateOne({
        req,
        connectionString,
        collection: "users",
        query: { firebaseUid: decoded.uid },
        update: { $set: updateFields as Record<string, unknown> },
      });

      user = { ...user, ...updateFields } as UserDocument;
    }

    if (user.authProvider !== "phone" && !user.isEmailVerified) {
      res.status(403).json({
        message: "Please verify your email before signing in.",
      });
      return;
    }

    res.status(200).json({
      message: "Signed in successfully",
      data: buildSigninProfile(user, decoded.uid),
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("signin failed", {
      message: err.message,
      stack: err.stack,
      name: err.name,
    });
    if (res.headersSent) return;
    const isAuthError =
      err.message?.includes("token") ||
      err.message?.includes("auth") ||
      err.name === "FirebaseAuthError";
    if (isAuthError) {
      res.status(401).json({
        message: "Invalid or expired authentication token",
      });
    } else {
      res.status(500).json({
        message: "Internal server error",
      });
    }
  }
}