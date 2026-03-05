import type { Role } from "../constants/roles";

declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email?: string;
        role: Role;
        isEmailVerified?: boolean;
        isEligibleForCoupons?: boolean;
      };
    }
  }
}

export {};
