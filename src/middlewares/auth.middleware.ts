import type { NextFunction, Request, Response } from "express";
import { firebaseAdminAuth } from "../config/firebase-admin";
import { UserModel } from "../models/user.model";

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      res.status(401).json({ message: "Missing Bearer token" });
      return;
    }

    const decoded = await firebaseAdminAuth.verifyIdToken(token);
    const email = decoded.email ?? "";

    let user = await UserModel.findOne({ firebaseUid: decoded.uid });
    if (!user && email) {
      user = await UserModel.create({
        firebaseUid: decoded.uid,
        email,
        role: "user",
        isEmailVerified: Boolean(decoded.email_verified),
      });
    }

    if (!user) {
      res.status(403).json({ message: "User profile not found" });
      return;
    }

    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      role: user.role,
    };

    next();
  } catch (_error) {
    res.status(401).json({ message: "Invalid or expired authentication token" });
  }
}
