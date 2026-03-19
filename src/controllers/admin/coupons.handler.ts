import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import db from "../../databaseUtilities";
import type {
  CouponDocument,
  CouponOfferConfig,
  CouponConditions,
  CouponCustomDateOffer,
  CouponSpecialDateRangeOffer,
  CouponWeekdayConfig,
} from "../../lib/db/types";

function parsePage(queryValue: unknown, defaultValue: number, max: number): number {
  const num = Number(queryValue);
  if (!Number.isFinite(num)) return defaultValue;
  return Math.min(max, Math.max(1, Math.floor(num)));
}

function buildDateFilter(dateParam: unknown): Record<string, unknown> | undefined {
  if (!dateParam || typeof dateParam !== "string") return undefined;
  const d = new Date(dateParam);
  if (Number.isNaN(d.getTime())) return undefined;
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { $gte: start, $lt: end };
}

function normalizePercentage(value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  if (!Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, Math.floor(value)));
}

function normalizeOfferConfig(raw: any): CouponOfferConfig {
  const defaultOfferRaw = normalizePercentage(raw?.defaultOffer);
  const defaultOffer = typeof defaultOfferRaw === "number" ? defaultOfferRaw : 0;

  const customDates: CouponCustomDateOffer[] | undefined = Array.isArray(raw?.customDates)
    ? raw.customDates
        .map((item: any) => {
          const date = item?.date ? new Date(item.date) : undefined;
          const percentage = normalizePercentage(item?.percentage);
          if (!date || Number.isNaN(date.getTime()) || typeof percentage !== "number") {
            return undefined;
          }
          return { date, percentage };
        })
        .filter((x: CouponCustomDateOffer | undefined): x is CouponCustomDateOffer => !!x)
    : undefined;

  const specialDateRanges: CouponSpecialDateRangeOffer[] | undefined = Array.isArray(
    raw?.specialDateRanges ?? raw?.specialDateRange
  )
    ? (raw.specialDateRanges ?? raw.specialDateRange)
        .map((item: any) => {
          const start = item?.startDateTime ? new Date(item.startDateTime) : undefined;
          const end = item?.endDateTime ? new Date(item.endDateTime) : undefined;
          const percentage = normalizePercentage(item?.percentage);
          if (
            !start ||
            !end ||
            Number.isNaN(start.getTime()) ||
            Number.isNaN(end.getTime()) ||
            typeof percentage !== "number"
          ) {
            return undefined;
          }
          const isEnabled = Boolean(item?.isEnabled ?? true);
          return { isEnabled, startDateTime: start, endDateTime: end, percentage };
        })
        .filter(
          (x: CouponSpecialDateRangeOffer | undefined): x is CouponSpecialDateRangeOffer => !!x
        )
    : undefined;

  let weekday: CouponWeekdayConfig | undefined;
  if (raw?.weekday) {
    const isEnabled = Boolean(raw.weekday.isEnabled);
    const daysRaw = raw.weekday.days ?? {};
    const days: CouponWeekdayConfig["days"] = {};
    (["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const).forEach((day) => {
      const pct = normalizePercentage(daysRaw[day]);
      if (typeof pct === "number") {
        days[day] = pct;
      }
    });
    weekday = { isEnabled, days };
  }

  const offerConfig: CouponOfferConfig = {
    defaultOffer,
  };
  if (customDates && customDates.length) offerConfig.customDates = customDates;
  if (specialDateRanges && specialDateRanges.length) offerConfig.specialDateRanges = specialDateRanges;
  if (weekday) offerConfig.weekday = weekday;

  return offerConfig;
}

function normalizeConditions(raw: any): CouponConditions | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const conditions: CouponConditions = {};
  if (typeof raw.minGuestCount === "number") conditions.minGuestCount = raw.minGuestCount;
  if (typeof raw.minBookingAmount === "number") conditions.minBookingAmount = raw.minBookingAmount;
  if (Array.isArray(raw.allowedSections)) {
    conditions.allowedSections = raw.allowedSections
      .map((s: unknown) => (typeof s === "string" ? s.trim() : ""))
      .filter((s: string) => s.length > 0);
  }
  if (Array.isArray(raw.allowedWeekdays)) {
    conditions.allowedWeekdays = raw.allowedWeekdays
      .map((s: unknown) => (typeof s === "string" ? s.trim().toLowerCase() : ""))
      .filter((s: string) => s.length > 0);
  }
  if (typeof raw.firstTimeUsersOnly === "boolean") {
    conditions.firstTimeUsersOnly = raw.firstTimeUsersOnly;
  }
  if (raw.validBookingTimeRange) {
    const startTime = typeof raw.validBookingTimeRange.startTime === "string"
      ? raw.validBookingTimeRange.startTime
      : undefined;
    const endTime = typeof raw.validBookingTimeRange.endTime === "string"
      ? raw.validBookingTimeRange.endTime
      : undefined;
    if (startTime && endTime) {
      conditions.validBookingTimeRange = { startTime, endTime };
    }
  }
  if (Object.keys(conditions).length === 0) return undefined;
  return conditions;
}

export async function listAdminCouponsHandler(req: Request, res: Response): Promise<void> {
  try {
    const page = parsePage(req.query.page, 1, 1000);
    const limit = parsePage(req.query.limit, 10, 100);
    const connectionString = db.constants.connectionStrings.tableBooking;

    const query: Record<string, unknown> = {};
    const statusRaw = Array.isArray(req.query.status) ? req.query.status[0] : req.query.status;
    const status = typeof statusRaw === "string" ? statusRaw.trim().toLowerCase() : "";
    if (status === "active") query.isActive = true;
    if (status === "inactive") query.isActive = false;
    const createdAtFilter = buildDateFilter(req.query.date);
    if (createdAtFilter) {
      query.createdAt = createdAtFilter;
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      db.read.find({
        req,
        connectionString,
        collection: db.constants.dbTables.coupons,
        query,
        sort: { createdAt: -1 },
        skip,
        limit,
      }),
      db.read.count({
        req,
        connectionString,
        collection: db.constants.dbTables.coupons,
        query,
      }),
    ]);

    res.status(200).json({
      message: "Coupons list",
      data: {
        items,
        total,
        page,
        limit,
      },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getAdminCouponByIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || typeof id !== "string" || !ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid coupon ID" });
      return;
    }
    const connectionString = db.constants.connectionStrings.tableBooking;
    const doc = await db.read.findOne({
      req,
      connectionString,
      collection: db.constants.dbTables.coupons,
      query: { _id: new ObjectId(id) },
    });
    if (!doc) {
      res.status(404).json({ message: "Coupon not found" });
      return;
    }
    res.status(200).json({ message: "Coupon", data: doc });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function createCouponHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Partial<CouponDocument> & {
      offerConfig?: unknown;
      conditions?: unknown;
    };

    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const defaultOffer = normalizePercentage(
      (body.offerConfig as any)?.defaultOffer ?? (req.body as any)?.defaultOffer
    );

    if (!code || !description || typeof defaultOffer !== "number") {
      res.status(400).json({
        message: "code, description and defaultOffer are required",
      });
      return;
    }

    const now = new Date();
    const isActive = typeof body.isActive === "boolean" ? body.isActive : true;
    const oneTimePerUser =
      typeof body.oneTimePerUser === "boolean" ? body.oneTimePerUser : false;

    let expiryDate: Date | null | undefined;
    if (body.expiryDate) {
      const d = new Date(body.expiryDate as unknown as string | number | Date);
      expiryDate = Number.isNaN(d.getTime()) ? undefined : d;
    }

    const maxUsageLimit =
      typeof body.maxUsageLimit === "number" && Number.isFinite(body.maxUsageLimit)
        ? body.maxUsageLimit
        : undefined;

    const offerConfig = normalizeOfferConfig(body.offerConfig ?? req.body);
    const conditions = normalizeConditions(body.conditions);

    const doc: CouponDocument = {
      code,
      description,
      isActive,
      oneTimePerUser,
      expiryDate,
      maxUsageLimit: maxUsageLimit ?? null,
      totalUsed: 0,
      totalReserved:0,
      offerConfig,
      conditions,
      termsAndConditions: Array.isArray(body.termsAndConditions)
        ? body.termsAndConditions.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        : undefined,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const connectionString = db.constants.connectionStrings.tableBooking;
    const result = await db.create.insertOne({
      req,
      connectionString,
      collection: db.constants.dbTables.coupons,
      payload: doc as unknown as Record<string, unknown>,
    });

    res.status(201).json({
      message: "Coupon created",
      data: { _id: result?.insertedId, ...doc },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateCouponHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || typeof id !== "string" || !ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid coupon ID" });
      return;
    }

    const body = req.body as Partial<CouponDocument> & {
      offerConfig?: unknown;
      conditions?: unknown;
    };

    const update: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof body.code === "string") {
      const code = body.code.trim().toUpperCase();
      if (code) update.code = code;
    }
    if (typeof body.description === "string") {
      const description = body.description.trim();
      if (description) update.description = description;
    }
    if (typeof body.isActive === "boolean") {
      update.isActive = body.isActive;
    }
    if (typeof body.oneTimePerUser === "boolean") {
      update.oneTimePerUser = body.oneTimePerUser;
    }
    if (body.expiryDate !== undefined) {
      if (body.expiryDate === null) {
        update.expiryDate = null;
      } else {
        const d = new Date(body.expiryDate as unknown as string | number | Date);
        if (!Number.isNaN(d.getTime())) {
          update.expiryDate = d;
        }
      }
    }
    if (body.maxUsageLimit === null) {
      update.maxUsageLimit = null;
    } else if (typeof body.maxUsageLimit === "number" && Number.isFinite(body.maxUsageLimit)) {
      update.maxUsageLimit = body.maxUsageLimit;
    }
    if (body.offerConfig !== undefined) {
      update.offerConfig = normalizeOfferConfig(body.offerConfig);
    }
    if (body.conditions !== undefined) {
      update.conditions = normalizeConditions(body.conditions) ?? null;
    }
    if (Array.isArray(body.termsAndConditions)) {
      update.termsAndConditions = body.termsAndConditions.filter(
        (t): t is string => typeof t === "string" && t.trim().length > 0
      );
    }

    if (Object.keys(update).length <= 1) {
      res.status(400).json({ message: "No valid fields to update" });
      return;
    }

    const connectionString = db.constants.connectionStrings.tableBooking;
    const result = await db.update.findOneAndUpdate({
      req,
      connectionString,
      collection: db.constants.dbTables.coupons,
      query: { _id: new ObjectId(id) },
      update: { $set: update },
      options: { returnDocument: "after" },
    });

    if (!result) {
      res.status(404).json({ message: "Coupon not found" });
      return;
    }

    res.status(200).json({ message: "Coupon updated", data: result });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function softDeleteCouponHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || typeof id !== "string" || !ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid coupon ID" });
      return;
    }

    const connectionString = db.constants.connectionStrings.tableBooking;
    const now = new Date();
    const result = await db.update.findOneAndUpdate({
      req,
      connectionString,
      collection: db.constants.dbTables.coupons,
      query: { _id: new ObjectId(id) },
      update: { $set: { isActive: false, deletedAt: now, updatedAt: now } },
      options: { returnDocument: "after" },
    });

    if (!result) {
      res.status(404).json({ message: "Coupon not found" });
      return;
    }

    res.status(200).json({ message: "Coupon deactivated", data: result });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

