import type { Role } from "../../constants/roles";

export interface UserDocument {
  _id?: import("mongodb").ObjectId;
  firebaseUid: string;
  email: string;
  displayName?: string;
  role: Role;
  isEmailVerified: boolean;
  isEligibleForCoupons?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
