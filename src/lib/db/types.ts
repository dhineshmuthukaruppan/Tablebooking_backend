import type { Role } from "../../constants/roles";

export type UserStatus = "active" | "inactive";

export interface UserDocument {
  _id?: import("mongodb").ObjectId;
  firebaseUid: string;
  email: string;
  displayName?: string;
  phoneNumber?: string;
  role: Role;
  status?: UserStatus;
  isEmailVerified: boolean;
  isEligibleForCoupons?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
