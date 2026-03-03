import { Schema, model } from "mongoose";
import { ROLES, type Role } from "../constants/roles";

export interface UserDocument {
  firebaseUid: string;
  email: string;
  role: Role;
  isEmailVerified: boolean;
}

const userSchema = new Schema<UserDocument>(
  {
    firebaseUid: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: { type: String, enum: ROLES, default: "user" },
    isEmailVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const UserModel = model<UserDocument>("User", userSchema);
