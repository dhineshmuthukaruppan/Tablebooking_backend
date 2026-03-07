import type { Role } from "../constants/roles";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id?: import("mongodb").ObjectId;
        uid: string;
        email?: string;
        displayName?: string;
        role: Role;
        isEmailVerified?: boolean;
        isEligibleForCoupons?: boolean;
        createdAt?: Date;
      };
    }
  }
}

export {};
