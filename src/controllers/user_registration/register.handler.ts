import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { MongoServerError } from "mongodb";
import { verifyIdToken } from "../../lib/auth/verifyFirebaseToken";
import type { UserDocument } from "../../lib/db/types";
import { normalizePhoneNumber } from "../../lib/auth/phoneNumber";
import {
  findUserByFirebaseUid,
  insertUser,
  updateUserByFirebaseUid,
  upsertPhoneCredential,
} from "../../lib/auth/phoneAuth.repository";
import { getNextUserSequence } from "../../lib/getNextUserSequence";
import db from "../../databaseUtilities";

export interface RegisterBody {
  idToken?: string;
  displayName?: string;
  /** Optional for phone registration; email registration ignores this. */
  password?: string;
}

/**
 * Public registration: no auth middleware. Accepts idToken and displayName in body.
 * Verifies Firebase idToken, then creates or updates user in MongoDB.
 */
export async function registerHandler(req: Request, res: Response): Promise<void> {
  try {
    const { idToken, displayName, password } = (req.body as RegisterBody) ?? {};
    const decoded = await verifyIdToken(idToken);
    if (!decoded) {
      res.status(401).json({ message: "Invalid or missing idToken" });
      return;
    }

    const email = decoded.email?.toLowerCase().trim() ?? null;
    const rawPhone = decoded.phone_number ?? null;
    const normalizedPhone = normalizePhoneNumber(rawPhone);

    if (!email && !normalizedPhone) {
      res.status(400).json({ message: "Email or phoneNumber is required" });
      return;
    }

    const isEmailVerified = Boolean(decoded.email_verified);
    const isPhoneVerified = Boolean(normalizedPhone);
    const displayNameTrimmed =
      typeof displayName === "string" ? displayName.trim() : undefined;
    const isPhoneRegistration = Boolean(normalizedPhone && !email);
    const now = new Date();
    const EMAIL = "mdhas0304@gmail.com";

    if (isPhoneRegistration) {
      if (!displayNameTrimmed) {
        res.status(400).json({ message: "displayName is required for phone signup" });
        return;
      }

      if (typeof password !== "string" || password.length < 6) {
        res.status(400).json({ message: "Password must be at least 6 characters" });
        return;
      }
    }

    let user = await findUserByFirebaseUid(req, decoded.uid);

    if (normalizedPhone) {
      const existingUser = (await db.read.findOne({
        req,
        connectionString: db.constants.connectionStrings.tableBooking,
        collection: "users",
        query: { phoneNumber: normalizedPhone },
      })) as UserDocument | null;

      if (existingUser && existingUser.firebaseUid !== decoded.uid) {
        console.log("REGISTER BLOCKED -> existing phone", normalizedPhone);
        res.status(409).json({
          message: "User already exists",
          code: "USER_ALREADY_EXISTS",
        });
        return;
      }
    }

    if (!user) {
      const authProvider: UserDocument["authProvider"] =
        normalizedPhone && !email ? "phone" : "email";

      const role: UserDocument["role"] = email === EMAIL ? "admin" : "user";

      const newUser: UserDocument = {
        firebaseUid: decoded.uid,
        ...(email ? { email } : {}),
        phoneNumber: normalizedPhone,
        ...(displayNameTrimmed && { displayName: displayNameTrimmed }),
        role,
        isSystemAdmin: email === EMAIL ? true : false,
        status: "active",
        isEmailVerified,
        isPhoneVerified,
        authProvider,
        isEligibleForCoupons: false,
        createdAt: now,
        updatedAt: now,
      };

      if (role === "user") {
        const userSequence = await getNextUserSequence(
          req,
          db.constants.connectionStrings.tableBooking
        );
        newUser.userSequence = userSequence;
      }

      await insertUser(req, newUser);
      console.log("REGISTER DEBUG -> user created");
      user = await findUserByFirebaseUid(req, decoded.uid);
    } else {
      const updateFields: Record<string, unknown> = {
        isEmailVerified,
        updatedAt: now,
      };
      if (email && user.email !== email) {
        updateFields.email = email;
      }
      if (displayNameTrimmed !== undefined) {
        updateFields.displayName = displayNameTrimmed;
      }
      if (normalizedPhone && user.phoneNumber !== normalizedPhone) {
        updateFields.phoneNumber = normalizedPhone;
      }
      if (user.isPhoneVerified !== isPhoneVerified) {
        updateFields.isPhoneVerified = isPhoneVerified;
      }
      if (normalizedPhone && !user.authProvider) {
        updateFields.authProvider = "phone";
      }

      // Backfill userSequence for existing "user" role documents that predate the sequence feature.
      if (user.role === "user" && (user as UserDocument).userSequence == null) {
        const userSequence = await getNextUserSequence(
          req,
          db.constants.connectionStrings.tableBooking
        );
        updateFields.userSequence = userSequence;
      }

      await updateUserByFirebaseUid(req, decoded.uid, updateFields);
      user = await findUserByFirebaseUid(req, decoded.uid);
    }

    const shouldSetPhonePassword =
      normalizedPhone &&
      typeof password === "string" &&
      password.length >= 6;

    if (shouldSetPhonePassword) {
      const hash = await bcrypt.hash(password as string, 10);
      await upsertPhoneCredential(req, {
        phoneNumber: normalizedPhone,
        passwordHash: hash,
        now,
      });
    }

    if (!user) {
      res.status(500).json({ message: "Failed to create user" });
      return;
    }

    const profile = {
      uid: decoded.uid,
      email: user.email,
      phoneNumber: user.phoneNumber,
      displayName: user.displayName,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      isEligibleForCoupons: user.isEligibleForCoupons ?? false,
    };

    res.status(201).json({
      message: "User registered successfully",
      data: profile,
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern ?? {})[0];
      if (duplicateField === "phoneNumber") {
        res.status(409).json({
          message: "User already exists",
          code: "USER_ALREADY_EXISTS",
        });
        return;
      }
      if (duplicateField === "email") {
        res.status(409).json({ message: "Email is already registered" });
        return;
      }
      if (duplicateField === "firebaseUid") {
        res.status(409).json({ message: "User already exists" });
        return;
      }
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[register] error:", message);
    res.status(500).json({ message: "Registration could not be completed. Please try again." });
  }
}
