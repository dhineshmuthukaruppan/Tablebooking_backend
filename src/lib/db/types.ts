import type { Role } from "../../constants/roles";

export interface UserDocument {
  _id?: import("mongodb").ObjectId;
  firebaseUid: string;
  email: string;
  displayName?: string;
  role: Role;
  isEmailVerified: boolean;
  phoneNumber?: string | null;
  isPhoneVerified: boolean;
  authProvider?: "email" | "phone";
  isEligibleForCoupons?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
