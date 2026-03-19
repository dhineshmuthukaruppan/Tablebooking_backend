import type { Role } from "../constants/roles";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id?: import("mongodb").ObjectId;
        uid: string;
        email?: string;
        phoneNumber?: string | null;
        displayName?: string;
        role: Role;
        isEmailVerified?: boolean;
        isPhoneVerified?: boolean;
        authProvider?: "email" | "phone";
        isEligibleForCoupons?: boolean;
        createdAt?: Date;
      };
    }
  }
}

export {};
