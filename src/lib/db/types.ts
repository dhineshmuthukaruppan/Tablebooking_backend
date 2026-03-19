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
  isEligibleForCoupons?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface VideoCategoryDocument {
  _id?: import("mongodb").ObjectId;
  name: string;
  slug: string;
  description?: string;
  isActive?: boolean;
  order?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type VideoProvider = "youtube";

export interface VideoDocument {
  _id?: import("mongodb").ObjectId;
  title: string;
  description?: string;
  provider: VideoProvider;
  youtubeId: string;
  youtubeUrl?: string;
  thumbnailUrl?: string;
  categoryId: import("mongodb").ObjectId;
  isPublished?: boolean;
  isFeatured?: boolean;
  featuredOrder?: number;
  order?: number;
  createdAt?: Date;
  updatedAt?: Date;
}
