import type { NextFunction, Request, Response } from "express";

export function requirePhoneVerified(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  if (!req.user.isPhoneVerified) {
    res.status(403).json({
      message: "Phone verification required",
      code: "PHONE_VERIFICATION_REQUIRED",
    });
    return;
  }

  next();
}

