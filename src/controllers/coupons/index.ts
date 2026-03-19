import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import db from "../../databaseUtilities";
import type { CouponDocument, CouponOfferConfig } from "../../lib/db/types";

function isNonEmptyDate(d: unknown): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

function normalizeOfferConfig(doc: CouponDocument): CouponOfferConfig {
  const offer = doc.offerConfig ?? { defaultOffer: 0 };
  const normalized: CouponOfferConfig = {
    defaultOffer: offer.defaultOffer ?? 0,
  };
  if (Array.isArray(offer.customDates)) {
    normalized.customDates = offer.customDates
      .filter((cd) => isNonEmptyDate(cd.date) && typeof cd.percentage === "number")
      .map((cd) => ({
        date: new Date(cd.date),
        percentage: cd.percentage,
      }));
  }
  if (Array.isArray(offer.specialDateRanges)) {
    normalized.specialDateRanges = offer.specialDateRanges
      .filter(
        (sr) =>
          isNonEmptyDate(sr.startDateTime) &&
          isNonEmptyDate(sr.endDateTime) &&
          typeof sr.percentage === "number",
      )
      .map((sr) => ({
        isEnabled: sr.isEnabled !== false,
        startDateTime: new Date(sr.startDateTime),
        endDateTime: new Date(sr.endDateTime),
        percentage: sr.percentage,
      }));
  }
  if (offer.weekday) {
    normalized.weekday = {
      isEnabled: offer.weekday.isEnabled ?? false,
      days: offer.weekday.days ?? {},
    };
  }
  return normalized;
}

/** Public list of active, non-deleted coupons (for displaying on booking page). */
export async function listCouponsHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const now = new Date();
    const query: Record<string, unknown> = {
      isActive: true,
      deletedAt: null,
    };
    // Filter out expired coupons: expiryDate is either null/absent or >= today
    query.$or = [
      { expiryDate: { $exists: false } },
      { expiryDate: null },
      { expiryDate: { $gte: now } },
    ];

    const items = await db.read.find({
      req,
      connectionString,
      collection: db.constants.dbTables.coupons,
      query,
      sort: { createdAt: -1 },
    });

    const mapped = (items as CouponDocument[]).map((doc) => ({
      _id: (doc as { _id?: ObjectId })._id,
      code: doc.code,
      description: doc.description,
      isActive: doc.isActive,
      oneTimePerUser: doc.oneTimePerUser,
      expiryDate: doc.expiryDate ?? null,
      maxUsageLimit: doc.maxUsageLimit ?? null,
      totalUsed: doc.totalUsed ?? 0,
      offerConfig: normalizeOfferConfig(doc),
      conditions: doc.conditions ?? undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));

    res.status(200).json({
      message: "Public coupons",
      data: mapped,
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export function redeemCouponHandler(_req: Request, res: Response): void {
  res.status(200).json({
    message: "Coupon redemption scaffold endpoint",
  });
}
