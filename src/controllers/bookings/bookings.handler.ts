import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { logger } from "../../config/logger";
import db from "../../databaseUtilities";
import * as slotInventory from "../../services/slotInventory";
import * as slotConfigService from "../../services/slotConfig";
import {
  sendAdminBookingCancellationEmail,
  sendAdminBookingConfirmationEmail,
  sendAdminPhoneUserBookingEmail,
  sendBookingCancellationEmail,
  sendBookingConfirmationEmail,
} from "../../services/email/email.service";
import { sendSMS } from "../../services/sms.service";
import {
  bookingCancelledSMS,
  bookingConfirmedSMS,
} from "../../services/smsTemplates";
import * as bookingSequence from "../../services/bookingSequence";

const GENERAL_MASTER_QUERY = { type: "default" } as const;

function formatBookingDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function buildBookingSmsData(params: {
  bookingId?: string;
  bookingDate: Date;
  startTime: string;
  endTime: string;
  guestCount: number;
}): { bookingId?: string; date: string; time: string; guests: number } {
  return {
    bookingId: params.bookingId,
    date: formatBookingDate(params.bookingDate),
    time: `${params.startTime} - ${params.endTime}`,
    guests: params.guestCount,
  };
}

/** Start of today 00:00:00 local time, end of today 23:59:59.999 local time */
function getTodayRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start, end };
}

/** Start of (today - daysOffset) 00:00:00 local time, end of today 23:59:59.999 local time */
function getWindowEndOfToday(daysOffset: number): { start: Date; end: Date } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const start = new Date(startOfToday);
  start.setDate(start.getDate() - daysOffset);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start, end };
}

/** GET /bookings/feedback-pending — bookings in last 4 days (today-4 start to today end), status completed, feedbackRequired true, feedback null. For current user. */
export async function getFeedbackPendingBookingsHandler(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const { start, end } = getWindowEndOfToday(4);
    const connectionString = db.constants.connectionStrings.tableBooking;
    const list = await db.read.find({
      req,
      connectionString,
      collection: "bookings",
      query: {
        userId: new ObjectId(userId.toString()),
        bookingDate: { $gte: start, $lte: end },
        status: "completed",
        feedbackRequired: true,
        $or: [{ feedback: null },{feedback: {skipped: { $ne: true }}}, { feedback: { $exists: false } }],
      },
      sort: { bookingDate: -1 },
      limit: 10,
    });
    res.status(200).json({ message: "Feedback pending bookings", data: list ?? [] });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

/** GET /bookings — query: customerId (optional), tab=upcoming|past (optional), page (1-based), limit. Server-side pagination. */
export async function listBookingsHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const customerId = typeof req.query.customerId === "string" ? req.query.customerId.trim() : null;
  const tab = typeof req.query.tab === "string" ? req.query.tab.trim().toLowerCase() : null;
    const page = Math.max(1, parseInt(String(req.query.page ?? 1), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 10), 10) || 10));
    const skip = (page - 1) * limit;

    let query: Record<string, unknown> = {};

    if (tab === "upcoming" || tab === "past") {
      const userId = customerId || req.user?.id?.toString();
      if (!userId) {
        res.status(400).json({ message: "customerId required when tab is used, or sign in" });
        return;
      }
      const { start: startOfToday, end: endOfToday } = getTodayRange();
      query = { userId: new ObjectId(userId) } as Record<string, unknown>;
      if (tab === "upcoming") {
        query.bookingDate = { $gte: startOfToday };
        query.status = { $in: ["pending", "confirmed"] };
      } else {
        query.$and = [
          { bookingDate: { $lte: endOfToday } },
          { status: { $nin: ["pending", "confirmed"] } },
        ];
      }
    } else if (customerId) {
      query = { userId: new ObjectId(customerId) };
    }

    const [list, total] = await Promise.all([
      db.read.find({
        req,
        connectionString,
        collection: "bookings",
        query,
        sort: { createdAt: -1 },
        skip,
        limit,
      }),
      db.read.count({
        req,
        connectionString,
        collection: "bookings",
        query,
      }),
    ]);

    res.status(200).json({
      message: "Bookings",
      data: list ?? [],
      total: total ?? 0,
      page,
      limit,
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

function getWeekdayName(date: Date): string {
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][
    date.getDay()
  ];
}

function isTimeWithinRange(time: string, start: string, end: string): boolean {
  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const t = toMinutes(time);
  const s = toMinutes(start);
  const e = toMinutes(end);
  return t >= s && t < e;
}

/** POST /bookings — create a booking (body: customerName, customerEmail, customerPhone?, bookingDate, sectionId, sectionName, slot, guestCount, couponCode?). */
export async function createBookingHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user?.id) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const userIdObjectId = new ObjectId(user.id.toString());
    const body = req.body as {
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      bookingDate?: string;
      sectionId?: string;
      sectionName?: string;
      slot?: { startTime?: string; endTime?: string };
      guestCount?: number;
      couponId?: string;
      couponCode?: string;
      appliedPercentage?: number;
    };
    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
    const customerEmail =
      typeof body.customerEmail === "string"
        ? body.customerEmail.trim()
        : (user.email ?? "").toLowerCase();
    const customerPhone =
      typeof body.customerPhone === "string" ? body.customerPhone.trim() : "";
    const bookingDateStr = typeof body.bookingDate === "string" ? body.bookingDate.trim() : "";
    const sectionIdStr = typeof body.sectionId === "string" ? body.sectionId.trim() : "";
    const sectionName = typeof body.sectionName === "string" ? body.sectionName.trim() : "";
    const slot = body.slot && typeof body.slot === "object" ? body.slot : {};
    const startTime = typeof slot.startTime === "string" ? slot.startTime.trim() : "";
    const endTime = typeof slot.endTime === "string" ? slot.endTime.trim() : "";
    const guestCount = typeof body.guestCount === "number" ? Math.max(1, Math.floor(body.guestCount)) : 1;
    const couponIdStr = typeof body.couponId === "string" ? body.couponId.trim() : "";
    const couponCode = typeof body.couponCode === "string" ? body.couponCode.trim().toUpperCase() : "";
    const appliedPercentageFromClient =
      typeof body.appliedPercentage === "number" && Number.isFinite(body.appliedPercentage)
        ? Math.floor(body.appliedPercentage)
        : null;

    if (!customerName || !bookingDateStr || !sectionIdStr || !sectionName || !startTime || !endTime) {
      res.status(400).json({
        message: "Missing required fields: customerName, bookingDate, sectionId, sectionName, slot.startTime, slot.endTime",
      });
      return;
    }
    const bookingDate = new Date(bookingDateStr);
    if (Number.isNaN(bookingDate.getTime())) {
      res.status(400).json({ message: "Invalid bookingDate" });
      return;
    }
    let sectionId: ObjectId;
    try {
      sectionId = new ObjectId(sectionIdStr);
    } catch {
      res.status(400).json({ message: "Invalid sectionId" });
      return;
    }

    const connectionString = db.constants.connectionStrings.tableBooking;
    const now = new Date();

    const config = await slotConfigService.getSlotConfigForDate(req, sectionId, bookingDate);
    if (!config) {
      res.status(400).json({ message: "No slot configuration for this date and section" });
      return;
    }
    const allowedSlots = slotConfigService.generateSlotsFromConfig(config);
    const slotValid = allowedSlots.some((s) => s.startTime === startTime && s.endTime === endTime);
    if (!slotValid) {
      res.status(400).json({ message: "Invalid slot for this date" });
      return;
    }

    const totalSeats = await slotInventory.getTotalSeatsFromTableMaster(req);
    await slotInventory.ensureSlotInventory({
      req,
      bookingDate,
      sectionId,
      slotStartTime: startTime,
      slotEndTime: endTime,
      totalSeats,
    });

    // Optional coupon validation (percentage + conditions).
    let appliedCoupon:
      | {
          couponId: ObjectId;
          couponCode: string;
          isReserved: true;
          isRedeemed: false;
          reservedAt: Date;
          redeemedAt: null;
          appliedPercentage: number;
        }
      | null = null;
    let shouldInsertRedeemReservation = false;
    if (couponCode) {
      let couponObjectId: ObjectId | null = null;
      if (couponIdStr && ObjectId.isValid(couponIdStr)) {
        couponObjectId = new ObjectId(couponIdStr);
      }

      type CouponForBookingValidation = {
        _id?: ObjectId;
        oneTimePerUser?: boolean | null;
        expiryDate?: Date | null;
        maxUsageLimit?: number | null;
        totalUsed?: number | null;
        totalReserved?: number | null;
        offerConfig?: {
          defaultOffer?: number;
          customDates?: { date: Date; percentage: number }[];
          specialDateRanges?: {
            isEnabled?: boolean;
            startDateTime?: Date;
            endDateTime?: Date;
            percentage: number;
          }[];
          weekday?: { isEnabled?: boolean; days?: Record<string, number | undefined> };
        };
        conditions?: {
          minGuestCount?: number;
          minBookingAmount?: number;
          allowedSections?: string[];
          allowedWeekdays?: string[];
          firstTimeUsersOnly?: boolean;
          validBookingTimeRange?: { startTime: string; endTime: string };
        };
      } & Record<string, unknown>;

      const coupon = (await db.read.findOne({
        req,
        connectionString,
        collection: db.constants.dbTables.coupons,
        query: couponObjectId
          ? { _id: couponObjectId, code: couponCode, isActive: true, deletedAt: null }
          : { code: couponCode, isActive: true, deletedAt: null },
      })) as CouponForBookingValidation | null;

      const invalidResponse = () => {
        res.status(400).json({ message: "Coupon expired or invalid for this booking" });
        return true;
      };


      if (!coupon) {
        if (invalidResponse()) return;
      } else {
        const couponId = coupon._id instanceof ObjectId ? coupon._id : null;
        if (!couponId) {
          invalidResponse();
          return;
        }

        if (coupon.oneTimePerUser === true) {
          const existingRedeem = await db.read.findOne({
            req,
            connectionString,
            collection: db.constants.dbTables.redeems,
            query: { couponId, userId: userIdObjectId },
            projection: { _id: 1 },
          });
          if (existingRedeem) {
            res.status(400).json({
              message: "Already redeemed. Please try any other coupons.",
            });
            return;
          }
          shouldInsertRedeemReservation = true;
        }

        if (coupon.expiryDate instanceof Date && !Number.isNaN(coupon.expiryDate.getTime())) {
          if (coupon.expiryDate.getTime() < bookingDate.getTime()) {
            if (invalidResponse()) return;
          }
        }

        if (
          typeof coupon.maxUsageLimit === "number" &&
          typeof coupon.totalUsed === "number" &&
          coupon.maxUsageLimit > 0 &&
          coupon.totalUsed >= coupon.maxUsageLimit
        ) {
          if (invalidResponse()) return;
        }

        const offer = coupon.offerConfig ?? {};
        let percentage = 0;

        // 1) Custom date offers – match by date only.
        if (Array.isArray(offer.customDates) && offer.customDates.length > 0) {
          const bookingKey = bookingDate.toISOString().slice(0, 10);
          for (const cd of offer.customDates) {
            if (!(cd.date instanceof Date)) continue;
            const cdKey = cd.date.toISOString().slice(0, 10);
            if (cdKey === bookingKey && typeof cd.percentage === "number") {
              percentage = cd.percentage;
              break;
            }
          }
        }

        // 2) Special date ranges – slot start must fall within enabled range.
        if (!percentage && Array.isArray(offer.specialDateRanges) && offer.specialDateRanges.length > 0) {
          const slotStart = new Date(bookingDate);
          const [sh, sm] = startTime.split(":").map(Number);
          slotStart.setHours(sh || 0, sm || 0, 0, 0);
          for (const sr of offer.specialDateRanges) {
            if (sr.isEnabled === false) continue;
            const startDt = sr.startDateTime instanceof Date ? sr.startDateTime : null;
            const endDt = sr.endDateTime instanceof Date ? sr.endDateTime : null;
            if (!startDt || !endDt) continue;
            if (slotStart.getTime() >= startDt.getTime() && slotStart.getTime() <= endDt.getTime()) {
              if (typeof sr.percentage === "number") {
                percentage = sr.percentage;
                break;
              }
            }
          }
        }

        // 3) Weekday offers.
        if (!percentage && offer.weekday?.isEnabled) {
          const weekday = getWeekdayName(bookingDate);
          const days = offer.weekday.days ?? {};
          const pct = days[weekday] ?? (days as Record<string, number | undefined>)[weekday.toLowerCase()];
          if (typeof pct === "number" && pct > 0) {
            percentage = pct;
          }
        }

        // 4) Default.
        if (!percentage && typeof offer.defaultOffer === "number" && offer.defaultOffer > 0) {
          percentage = offer.defaultOffer;
        }

        // Conditions.
        const conditions = coupon.conditions ?? {};
        const bookingWeekday = getWeekdayName(bookingDate);
        if (conditions.minGuestCount && guestCount < conditions.minGuestCount) {
          if (invalidResponse()) return;
        }
        if (
          Array.isArray(conditions.allowedWeekdays) &&
          conditions.allowedWeekdays.length > 0 &&
          !conditions.allowedWeekdays
            .map((w) => w.toLowerCase())
            .includes(bookingWeekday.toLowerCase())
        ) {
          if (invalidResponse()) return;
        }
        if (
          Array.isArray(conditions.allowedSections) &&
          conditions.allowedSections.length > 0 &&
          !conditions.allowedSections.some(
            (s) => s.trim().toLowerCase() === sectionName.toLowerCase(),
          )
        ) {
          if (invalidResponse()) return;
        }
        if (
          conditions.validBookingTimeRange &&
          !isTimeWithinRange(startTime, conditions.validBookingTimeRange.startTime, conditions.validBookingTimeRange.endTime)
        ) {
          if (invalidResponse()) return;
        }

        if (!percentage || percentage <= 0) {
          if (invalidResponse()) return;
        }

        // Client/server mismatch guard (prevents stale UI / tampering).
        if (appliedPercentageFromClient !== null && appliedPercentageFromClient !== Math.floor(percentage)) {
          res.status(400).json({ message: "Coupon mismatch. Please select the coupon again." });
          return;
        }

        appliedCoupon = {
          couponId,
          couponCode,
          isReserved: true,
          isRedeemed: false,
          reservedAt: now,
          redeemedAt: null,
          appliedPercentage: percentage,
        };
      }
    }

    const allocated = await slotInventory.allocateSeats({
      req,
      bookingDate,
      sectionId,
      slotStartTime: startTime,
      slotEndTime: endTime,
      guestCount,
    });

    let status: "confirmed" | "pending" = "confirmed";
    if (!allocated) {
      const guestDateDoc = await db.read.findOne({
        req,
        connectionString,
        collection: db.constants.dbTables.general_master,
        query: GENERAL_MASTER_QUERY,
      }) as { allowBookingWhenSlotFull?: boolean } | null;
      const allowWhenFull = guestDateDoc?.allowBookingWhenSlotFull === true;
      if (allowWhenFull) {
        status = "pending";
      } else {
        const remaining = await slotInventory.getRemainingSeats(req, bookingDate, sectionId, startTime, endTime);
        res.status(400).json({
          message: `Slot is full. Available only for ${remaining} guests.`,
        });
        return;
      }
    }

    const bookingNumber = await bookingSequence.getNextBookingNumber(req);
    const doc = {
      bookingNumber,
      userId: user.id,
      customerName,
      customerPhone: customerPhone || undefined,
      customerEmail: customerEmail || undefined,
      bookingDate,
      sectionId,
      sectionName,
      slot: { startTime, endTime },
      guestCount,
      status,
      coupon: appliedCoupon,
      billing: null,
      payment: {
        status: null,
        method: null,
        initiatedByStaff: false,
        stripePaymentIntentId: null,
        paidAt: null,
      },
      feedbackRequired: false,
      feedback: null,
      createdAt: now,
      updatedAt: now,
    };
    const insertResult = await db.create.insertOne({
      req,
      connectionString,
      collection: "bookings",
      payload: doc as unknown as Record<string, unknown>,
    });
    const bookingId = insertResult?.insertedId;

    if (shouldInsertRedeemReservation && appliedCoupon?.couponId && bookingId) {
      void db.create.insertOne({
        req,
        connectionString,
        collection: db.constants.dbTables.redeems,
        payload: {
          couponId: appliedCoupon.couponId,
          userId: userIdObjectId,
          bookingId,
          reservedAt: now,
          redeemedAt: null,
        },
      });
    }

    const responseDoc = bookingId ? { ...doc, _id: bookingId } : doc;

    const notificationPhone =
      typeof user.phoneNumber === "string" ? user.phoneNumber.trim() : "";
    const isPhoneAuth = user.authProvider === "phone";

    // Mark coupon as reserved (+1) after booking is created.
    if (appliedCoupon?.couponId) {
      void db.update
        .updateOne({
          req,
          connectionString,
          collection: db.constants.dbTables.coupons,
          query: { _id: appliedCoupon.couponId },
          update: { $inc: { totalReserved: 1 }, $set: { updatedAt: now } },
        })
        .catch(() => {
          // non-blocking; booking remains valid even if analytics counters fail
        });
    }

    logger.info("Booking created by user", {
      bookingId: bookingId ? bookingId.toString() : null,
      status,
      emailTriggered: Boolean(customerEmail && status === "confirmed"),
      smsTriggered: Boolean(
        notificationPhone && isPhoneAuth && req.user?.role === "user" && status === "confirmed"
      ),
    });

    if (customerEmail && status === "confirmed" && !isPhoneAuth) {
      const bookingDateDisplay = formatBookingDate(bookingDate);

      const emailPayload = {
        customerEmail,
        customerId: user.id.toString(),
        customerName,
        bookingId: bookingId ? bookingId.toString() : "",
        bookingDate: bookingDateDisplay,
        startTime,
        endTime,
        guests: guestCount,
        section: sectionName,
        venueName: "The Sheesha Factory",
        location: "RS Puram, Coimbatore",
      };

      // Fire-and-forget; do not block booking response on email dispatch.
      void sendBookingConfirmationEmail(emailPayload).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[booking] Booking confirmation email failed", err);
      });

      // Also notify the admin contact for auto-confirmed bookings (email-auth users).
      void sendAdminBookingConfirmationEmail(req, emailPayload).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[booking] Admin booking confirmation email failed", err);
      });
    }

    if (req.user?.role === "user" && isPhoneAuth && notificationPhone) {
      const smsPayload = buildBookingSmsData({
        bookingId: bookingId ? bookingId.toString() : undefined,
        bookingDate,
        startTime,
        endTime,
        guestCount,
      });

      if (status === "confirmed") {
        logger.info("SMS Trigger → Booking Confirmed", {
          bookingId: bookingId ? bookingId.toString() : null,
        });
        void sendSMS({
          to: notificationPhone,
          body: bookingConfirmedSMS(smsPayload),
        });

        const adminEmailPayload = {
          customerEmail: undefined,
          customerId: user.id.toString(),
          customerName,
          customerPhone: notificationPhone || undefined,
          bookingId: bookingId ? bookingId.toString() : "",
          bookingDate: formatBookingDate(bookingDate),
          startTime,
          endTime,
          guests: guestCount,
          section: sectionName,
          venueName: "The Sheesha Factory",
          location: "RS Puram, Coimbatore",
        };

        void sendAdminPhoneUserBookingEmail(req, adminEmailPayload).catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[booking] Admin phone-user booking email failed", err);
        });
      }
    }

    res.status(201).json({
      message: "Booking created",
      data: responseDoc,
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

/** PATCH /bookings/:id/cancel — cancel a booking. User can only cancel own; only when status is "pending" or "confirmed". */
export async function cancelBookingHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || typeof id !== "string" || !ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid booking id" });
      return;
    }
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const connectionString = db.constants.connectionStrings.tableBooking;
    const booking = await db.read.findOne({
      req,
      connectionString,
      collection: "bookings",
      query: { _id: new ObjectId(id), userId: new ObjectId(userId.toString()) },
    });
    if (!booking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }
    const currentStatus = (booking as { status?: string }).status;
    if (currentStatus !== "pending" && currentStatus !== "confirmed") {
      res.status(400).json({ message: "Only pending or confirmed bookings can be cancelled" });
      return;
    }
    const now = new Date();
    const b = booking as {
      bookingDate?: Date;
      sectionId?: ObjectId;
      customerEmail?: string;
      customerName?: string;
      sectionName?: string;
      slot?: { startTime?: string; endTime?: string };
      guestCount?: number;
    };
    if (currentStatus === "confirmed" && b.bookingDate && b.sectionId && b.slot?.startTime != null && b.slot?.endTime != null && typeof b.guestCount === "number") {
      await slotInventory.releaseSeats({
        req,
        bookingDate: b.bookingDate,
        sectionId: b.sectionId,
        slotStartTime: String(b.slot.startTime),
        slotEndTime: String(b.slot.endTime),
        guestCount: b.guestCount,
      });
    }
    await db.update.updateOne({
      req,
      connectionString,
      collection: "bookings",
      query: { _id: new ObjectId(id), userId: new ObjectId(userId.toString()) },
      update: { $set: { status: "cancelled", updatedAt: now } },
    });

    console.log("EMAIL DEBUG → status change", {
      bookingId: id,
      previousStatus: currentStatus,
      newStatus: "cancelled",
      customerEmail: b.customerEmail,
    });

    if (
      currentStatus === "pending" &&
      typeof b.customerName === "string" &&
      b.customerName &&
      b.bookingDate &&
      b.slot?.startTime &&
      b.slot?.endTime &&
      typeof b.sectionName === "string" &&
      b.sectionName
    ) {
      const trimmedEmail =
        typeof b.customerEmail === "string" && b.customerEmail.trim()
          ? b.customerEmail.trim()
          : undefined;

      const emailPayload = {
        customerEmail: trimmedEmail,
        customerId: userId.toString(),
        customerName: b.customerName,
        bookingId: id,
        bookingDate: formatBookingDate(b.bookingDate),
        startTime: b.slot.startTime,
        endTime: b.slot.endTime,
        guests: typeof b.guestCount === "number" ? b.guestCount : 0,
        section: b.sectionName,
        venueName: "The Sheesha Factory",
        location: "RS Puram, Coimbatore",
      };

      console.log("EMAIL DEBUG → cancellation payload", emailPayload);

      if (trimmedEmail) {
        void sendBookingCancellationEmail(emailPayload).catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[booking] Booking cancellation email failed", err);
        });
      }

      void sendAdminBookingCancellationEmail(req, emailPayload).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[booking] Admin booking cancellation email failed", err);
      });
    }

    const notificationPhone =
      typeof req.user?.phoneNumber === "string"
        ? req.user.phoneNumber.trim()
        : "";
    const isPhoneAuth = req.user?.authProvider === "phone";

    if (
      req.user?.role === "user" &&
      isPhoneAuth &&
      currentStatus === "pending" &&
      notificationPhone &&
      b.bookingDate &&
      b.slot?.startTime &&
      b.slot?.endTime
    ) {
      logger.info("SMS Trigger → Booking Cancelled", { bookingId: id });
      void sendSMS({
        to: notificationPhone,
        body: bookingCancelledSMS(
          buildBookingSmsData({
            bookingDate: b.bookingDate,
            startTime: b.slot.startTime,
            endTime: b.slot.endTime,
            guestCount: typeof b.guestCount === "number" ? b.guestCount : 0,
          })
        ),
      });
    }

    res.status(200).json({ message: "Booking cancelled", data: { _id: id, status: "cancelled" } });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

/** GET /bookings/:id — fetch one booking by id. User can only fetch their own. */
export async function getBookingByIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || typeof id !== "string" || !ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid booking id" });
      return;
    }
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const connectionString = db.constants.connectionStrings.tableBooking;
    const doc = await db.read.findOne({
      req,
      connectionString,
      collection: "bookings",
      query: { _id: new ObjectId(id), userId: new ObjectId(userId.toString()) },
    });
    if (!doc) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }
    res.status(200).json({ message: "Booking", data: doc });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

/** GET /bookings/slots?bookingDate=YYYY-MM-DD — date-aware slots per section (server-side generation). */
export async function getSlotsHandler(req: Request, res: Response): Promise<void> {
  try {
    const bookingDateStr = typeof req.query.bookingDate === "string" ? req.query.bookingDate.trim() : "";
    if (!bookingDateStr) {
      res.status(400).json({ message: "bookingDate query is required (YYYY-MM-DD)" });
      return;
    }
    const bookingDate = new Date(bookingDateStr);
    if (Number.isNaN(bookingDate.getTime())) {
      res.status(400).json({ message: "Invalid bookingDate" });
      return;
    }

    const connectionString = db.constants.connectionStrings.tableBooking;
    const sections = (await db.read.find({
      req,
      connectionString,
      collection: "meal_time_master",
      query: { isActive: true },
      sort: { startTime: 1 },
    })) as Array<{ _id?: ObjectId; sectionName?: string }>;

    const result: Array<{
      sectionId: string;
      sectionName: string;
      slots: Array<{ startTime: string; endTime: string }>;
    }> = [];

    for (const sec of sections ?? []) {
      const id = sec._id;
      if (!id) continue;
      const config = await slotConfigService.getSlotConfigForDate(req, id, bookingDate);
      if (!config) continue;
      const slots = slotConfigService.generateSlotsFromConfig(config);
      result.push({
        sectionId: id.toString(),
        sectionName: (sec.sectionName as string) ?? "",
        slots: slots.map((s) => ({ startTime: s.startTime, endTime: s.endTime })),
      });
    }

    res.status(200).json({
      message: "Slots",
      data: { sections: result },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

/** Returns general master config and active meal-time sections for the booking flow. When bookingDate query is present, returns date-aware slot config per section (data.sections). */
export async function getBookingConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;

    const bookingDateStr = typeof req.query.bookingDate === "string" ? req.query.bookingDate.trim() : "";

    const [guestDateDoc, mealTimeList] = await Promise.all([
      db.read.findOne({
        req,
        connectionString,
        collection: db.constants.dbTables.general_master,
        query: GENERAL_MASTER_QUERY,
      }),
      db.read.find({
        req,
        connectionString,
        collection: db.constants.dbTables.meal_time_master,
        query: { isActive: true },
        sort: { startTime: 1 },
      }),
    ]);

    const guestDate = guestDateDoc as { maxGuestCount?: number; maxDaysCount?: number } | null;
    const maxGuestCount = guestDate?.maxGuestCount ?? 30;
    const maxDaysCount = guestDate?.maxDaysCount ?? 30;

    if (bookingDateStr) {
      const bookingDate = new Date(bookingDateStr);
      if (Number.isNaN(bookingDate.getTime())) {
        res.status(400).json({ message: "Invalid bookingDate" });
        return;
      }
      const sectionsList = (mealTimeList ?? []) as Array<{ _id?: unknown; sectionName?: string }>;
      const sections: Array<{
        sectionId: string;
        sectionName: string;
        startTime: string;
        endTime: string;
        slotDuration: number;
        slotDurationType?: string;
        effectiveFrom?: string;
      }> = [];
      for (const sec of sectionsList) {
        const id = sec._id;
        if (!id) continue;
        const sectionId = id instanceof ObjectId ? id : new ObjectId(String(id));
        const config = await slotConfigService.getSlotConfigForDate(req, sectionId, bookingDate);
        if (!config) continue;
        sections.push({
          sectionId: sectionId.toString(),
          sectionName: (sec.sectionName as string) ?? "",
          startTime: config.startTime,
          endTime: config.endTime,
          slotDuration: config.slotDuration,
          slotDurationType: config.slotDurationType ?? "minutes",
          effectiveFrom: config.effectiveFrom,
        });
      }
      res.status(200).json({
        message: "Booking config",
        data: {
          guestDates: { maxGuestCount, maxDaysCount },
          sections,
        },
      });
      return;
    }

    const sections = (mealTimeList ?? []) as Array<Record<string, unknown>>;
    res.status(200).json({
      message: "Booking config",
      data: {
        guestDates: { maxGuestCount, maxDaysCount },
        mealTimeSections: sections,
      },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}
