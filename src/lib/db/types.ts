import type { Role } from "../../constants/roles";

export type UserStatus = "active" | "inactive";

export interface UserDocument {
  _id?: import("mongodb").ObjectId;
  firebaseUid: string;
  email: string;
  displayName?: string;
  mobile?: string;
  role: Role;
  status?: UserStatus;
  isEmailVerified: boolean;
  phoneNumber?: string | null;
  isPhoneVerified: boolean;
  authProvider?: "email" | "phone";
  isEligibleForCoupons?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
