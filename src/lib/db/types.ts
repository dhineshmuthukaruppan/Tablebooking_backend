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

export interface CouponWeekdayConfig {
  isEnabled: boolean;
  days: {
    monday?: number;
    tuesday?: number;
    wednesday?: number;
    thursday?: number;
    friday?: number;
    saturday?: number;
    sunday?: number;
  };
}

export interface CouponCustomDateOffer {
  date: Date;
  percentage: number;
}

export interface CouponSpecialDateRangeOffer {
  isEnabled: boolean;
  startDateTime: Date;
  endDateTime: Date;
  percentage: number;
}

export interface CouponOfferConfig {
  defaultOffer: number;
  customDates?: CouponCustomDateOffer[];
  specialDateRanges?: CouponSpecialDateRangeOffer[];
  weekday?: CouponWeekdayConfig;
}

export interface CouponConditions {
  minGuestCount?: number;
  minBookingAmount?: number;
  allowedSections?: string[];
  allowedWeekdays?: string[];
  firstTimeUsersOnly?: boolean;
  validBookingTimeRange?: {
    startTime: string;
    endTime: string;
  };
}

export interface CouponDocument {
  _id?: import("mongodb").ObjectId;
  code: string;
  description: string;
  isActive: boolean;
  oneTimePerUser: boolean;
  expiryDate?: Date | null;
  maxUsageLimit?: number | null;
  totalUsed?: number;
  totalReserved?: number;
  offerConfig: CouponOfferConfig;
  conditions?: CouponConditions;
  termsAndConditions?: string[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface VideoCategoryDocument {
  _id?: import("mongodb").ObjectId;
  name: string;
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
  order?: number;
  createdAt?: Date;
  updatedAt?: Date;
}
