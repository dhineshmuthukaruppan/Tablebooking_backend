import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import db from "../../databaseUtilities";
import { verifyIdToken } from "../../lib/auth/verifyFirebaseToken";
import type { UserDocument } from "../../lib/db/types";
import { parsePhoneNumberFromString } from "libphonenumber-js";

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

    const email = (decoded.email ?? "").toLowerCase().trim();
    const rawPhone = decoded.phone_number ?? null;
    const normalizedPhone = rawPhone
      ? parsePhoneNumberFromString(rawPhone)?.number ?? rawPhone
      : null;

    if (!email && !normalizedPhone) {
      res.status(400).json({ message: "Email or phoneNumber is required" });
      return;
    }

    const connectionString = db.constants.connectionStrings.tableBooking;
    const isEmailVerified = Boolean(decoded.email_verified);
    const isPhoneVerified = Boolean(normalizedPhone);
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
      const authProvider: UserDocument["authProvider"] =
        normalizedPhone && !email ? "phone" : "email";

      const newUser: UserDocument = {
        firebaseUid: decoded.uid,
        email,
        phoneNumber: normalizedPhone,
        ...(displayNameTrimmed && { displayName: displayNameTrimmed }),
        role: email==="mdhas0304@gmail.com"?"admin":"user",
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
    } else {
      const updateFields: Record<string, unknown> = {
        isEmailVerified,
        updatedAt: now,
      };
      if (displayNameTrimmed !== undefined) {
        updateFields.displayName = displayNameTrimmed;
      }
      if (normalizedPhone && user.phoneNumber !== normalizedPhone) {
        updateFields.phoneNumber = normalizedPhone;
      }
      if (user.isPhoneVerified !== isPhoneVerified) {
        updateFields.isPhoneVerified = isPhoneVerified;
      }
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

    const shouldSetPhonePassword =
      normalizedPhone &&
      typeof password === "string" &&
      password.length >= 6;

    if (shouldSetPhonePassword) {
      const hash = await bcrypt.hash(password as string, 10);
      await db.update.updateOne({
        req,
        connectionString,
        collection: "phone_credentials",
        query: { phoneNumber: normalizedPhone },
        update: {
          $set: {
            phoneNumber: normalizedPhone,
            passwordHash: hash,
            updatedAt: now,
          },
        },
      });
      // #region agent log
      fetch('http://127.0.0.1:7523/ingest/6df3f0fb-ba94-436b-ba90-c5b1ad0e266b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'43319a'},body:JSON.stringify({sessionId:'43319a',runId:'pre-fix',hypothesisId:'H6',location:'register.handler.ts:120',message:'phone credentials created/updated during register',data:{normalizedPhone},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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
  } catch {
    res.status(401).json({ message: "Invalid or expired authentication token" });
  }
}
