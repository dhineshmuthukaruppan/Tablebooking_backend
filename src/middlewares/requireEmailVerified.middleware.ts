import type { NextFunction, Request, Response } from "express";

/**
 * Use after authenticate(). Returns 403 if the user's email is not verified.
 * Wire to routes that should be restricted to verified users (e.g. coupon redemption in Week 2).
 */
export function requireEmailVerified(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const isEmailVerified = Boolean(req.user.isEmailVerified);
  const isPhoneVerified = Boolean(req.user.isPhoneVerified);

  if (!isEmailVerified && !isPhoneVerified) {
    res.status(403).json({
      message: "Email or phone verification required",
      code: "EMAIL_VERIFICATION_REQUIRED",
    });
    return;
  }
  next();
}
