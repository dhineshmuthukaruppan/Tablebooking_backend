import type { NextFunction, Request, Response } from "express";
import type { Role } from "../constants/roles";

export function requireRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: "Forbidden: insufficient role permission" });
      return;
    }

    next();
  };
}
