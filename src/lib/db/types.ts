import type { Role } from "../../constants/roles";

export type UserStatus = "active" | "inactive";

export interface UserDocument {
  _id?: import("mongodb").ObjectId;
  firebaseUid: string;
  email?: string | null;
  displayName?: string;
  phoneNumber?: string | null;
  role: Role;
  isSystemAdmin?: boolean;
  status?: UserStatus;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  authProvider?: "email" | "phone";
  isEligibleForCoupons?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  
}
