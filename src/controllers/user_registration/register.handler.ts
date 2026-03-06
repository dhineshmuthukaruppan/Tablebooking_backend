import type { Request, Response } from "express";
import db from "../../databaseUtilities";

export interface RegisterBody {
  displayName?: string;
}

/**
 * Expects req.user set by auth.authentication.authenticate (Bearer token in header).
 * Updates the user in MongoDB with displayName from body and returns profile.
 */
export async function registerHandler(req: Request, res: Response): Promise<void> {
  try {
    const userFromAuth = req.user;
    if (!userFromAuth?.uid) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }

    const { displayName } = (req.body as RegisterBody) ?? {};
    const displayNameTrimmed =
      typeof displayName === "string" ? displayName.trim() : undefined;

    const connectionString = db.constants.connectionStrings.tableBooking;
    const now = new Date();

    await db.update.updateOne({
      req,
      connectionString,
      collection: "users",
      query: { firebaseUid: userFromAuth.uid },
      update: {
        $set: {
          ...(displayNameTrimmed !== undefined && displayNameTrimmed !== "" && { displayName: displayNameTrimmed }),
          updatedAt: now,
        },
      },
    });

    const user = await db.read.findOne({
      req,
      connectionString,
      collection: "users",
      query: { firebaseUid: userFromAuth.uid },
    }) as { email: string; displayName?: string; role: string; isEmailVerified: boolean; isEligibleForCoupons?: boolean } | null;
    if (!user) {
      res.status(500).json({ message: "User not found" });
      return;
    }

    const profile = {
      uid: userFromAuth.uid,
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
    res.status(500).json({ message: "Registration failed" });
  }
}
