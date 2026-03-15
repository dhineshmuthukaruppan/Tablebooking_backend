import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { firebaseAdminAuth } from "../../config/firebase-admin";
import { normalizePhoneNumber } from "../../lib/auth/phoneNumber";
import {
  findPhoneCredential,
  findUserByPhoneNumber,
  upsertPhoneCredential,
} from "../../lib/auth/phoneAuth.repository";

interface PhoneLoginBody {
  phoneNumber?: string;
  password?: string;
}

interface PhonePasswordBody {
  phoneNumber?: string;
  newPassword?: string;
}

export async function setPhonePasswordHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!req.user || !req.user.phoneNumber) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const { newPassword } = (req.body as PhonePasswordBody) ?? {};
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      res.status(400).json({ message: "Password must be at least 6 characters" });
      return;
    }

    const hash = await bcrypt.hash(newPassword, 10);
    const normalizedPhone = normalizePhoneNumber(req.user.phoneNumber);
    if (!normalizedPhone) {
      res.status(400).json({ message: "Authenticated phone number is invalid" });
      return;
    }

    await upsertPhoneCredential(req, {
      phoneNumber: normalizedPhone,
      passwordHash: hash,
      now: new Date(),
    });

    res.status(200).json({ message: "Phone password set successfully" });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function phoneLoginHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { phoneNumber, password } = (req.body as PhoneLoginBody) ?? {};
    if (!phoneNumber || !password) {
      res.status(400).json({ message: "phoneNumber and password are required" });
      return;
    }

    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      res.status(400).json({ message: "Invalid phone number" });
      return;
    }

    const user = await findUserByPhoneNumber(req, normalizedPhone);
    if (!user?.firebaseUid || user.authProvider !== "phone") {
      res.status(401).json({ message: "Invalid phone or password" });
      return;
    }

    if (user.status === "inactive") {
      res.status(403).json({ message: "You are inactive. Please contact admin." });
      return;
    }

    const credentials = await findPhoneCredential(req, normalizedPhone);
    if (!credentials?.passwordHash) {
      res.status(401).json({ message: "Invalid phone or password" });
      return;
    }

    const passwordMatches = await bcrypt.compare(password, credentials.passwordHash);
    if (!passwordMatches) {
      res.status(401).json({ message: "Invalid phone or password" });
      return;
    }

    const customToken = await firebaseAdminAuth.createCustomToken(user.firebaseUid);

    res.status(200).json({
      message: "Phone login successful",
      data: { customToken },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function resetPasswordPhoneHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!req.user || !req.user.phoneNumber) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const { phoneNumber, newPassword } = (req.body as PhonePasswordBody) ?? {};

    if (!phoneNumber || phoneNumber !== req.user.phoneNumber) {
      res.status(400).json({ message: "phoneNumber must match authenticated user" });
      return;
    }

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      res.status(400).json({ message: "Password must be at least 6 characters" });
      return;
    }

    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      res.status(400).json({ message: "Invalid phone number" });
      return;
    }

    const hash = await bcrypt.hash(newPassword, 10);

    await upsertPhoneCredential(req, {
      phoneNumber: normalizedPhone,
      passwordHash: hash,
      now: new Date(),
    });

    res.status(200).json({ message: "Password reset successfully" });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

