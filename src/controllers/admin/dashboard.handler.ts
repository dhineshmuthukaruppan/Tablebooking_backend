import type { Request, Response } from "express";
import { dbTables, connectionStrings } from "../../databaseUtilities/constants/databaseConstants";

function getDb(req: Request): import("mongodb").Db {
  const db = req.app.locals[connectionStrings.tableBooking + "DB"];
  if (!db) throw new Error("Database not attached to app.locals.");
  return db as import("mongodb").Db;
}

export interface DashboardStats {
  /** Users with verified emails */
  verifiedUsersCount: number;
  /** Online (booked) customers who showed up – status=completed, userId not null */
  onlineCustomersCount: number;
  /** Walk-in / offline customers – status=completed, userId=null */
  offlineCustomersCount: number;
  /** Sum of billing.finalAmount for paid bookings */
  totalRevenue: number;
  /** Sum of billing.discountAmount for paid bookings */
  totalDiscount: number;
  /** Total bookings / distinct booking dates */
  avgBookingsPerDay: number;
  /**
   * % of booked online customers who showed up.
   * completed / (confirmed + completed) * 100
   */
  showOffRate: number;
  /** Total feedbacks submitted */
  totalFeedbacks: number;
  approvedFeedbacks: number;
  rejectedFeedbacks: number;
  pendingFeedbacks: number;
  /** Coupons: total used across all coupons */
  totalCouponsRedeemed: number;
  /** Coupons: total reserved across all coupons */
  totalCouponsReserved: number;
  /** Per-coupon breakdown */
  couponBreakdown: { code: string; description: string; totalUsed: number; totalReserved: number }[];
  /** Busy hours: [{ slot: "HH:mm", count: number }] sorted desc */
  busyHours: { slot: string; count: number }[];
}

export async function dashboardHandler(req: Request, res: Response): Promise<void> {
  try {
    const db = getDb(req);

    const usersCol = db.collection(dbTables.users);
    const bookingsCol = db.collection(dbTables.bookings);
    const feedbacksCol = db.collection(dbTables.feedbacks);
    const couponsCol = db.collection(dbTables.coupons);

    const [
      verifiedUsersCount,
      onlineCustomersCount,
      offlineCustomersCount,
      onlineConfirmedCount,
      totalFeedbacks,
      approvedFeedbacks,
      rejectedFeedbacks,
      revenueAgg,
      avgBookingsAgg,
      busyHoursAgg,
      couponDocs,
    ] = await Promise.all([
      // 1. Verified users
      usersCol.countDocuments({ isEmailVerified: true }),

      // 2. Online customers who showed up
      bookingsCol.countDocuments({ status: "completed", userId: { $ne: null } }),

      // 3. Offline / walk-in customers
      bookingsCol.countDocuments({ status: "completed", userId: null }),

      // For show-off rate denominator
      bookingsCol.countDocuments({ status: "confirmed", userId: { $ne: null } }),

      // 10. Total feedbacks
      feedbacksCol.countDocuments({}),

      // 11a. Approved feedbacks
      feedbacksCol.countDocuments({ isPublicVisible: true }),

      // 11b. Rejected feedbacks (explicitly set to false)
      feedbacksCol.countDocuments({ isPublicVisible: false }),

      // 6+7. Revenue + discount
      bookingsCol.aggregate([
        { $match: { "payment.status": "paid" } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$billing.finalAmount" },
            totalDiscount: { $sum: "$billing.discountAmount" },
          },
        },
      ]).toArray(),

      // 8. Avg bookings per day
      bookingsCol.aggregate([
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$bookingDate",
              },
            },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: null,
            totalDays: { $sum: 1 },
            totalBookings: { $sum: "$count" },
          },
        },
      ]).toArray(),

      // 12. Busy hours
      bookingsCol.aggregate([
        { $match: { "slot.startTime": { $exists: true, $ne: null, $ne: "" } } },
        { $group: { _id: "$slot.startTime", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 24 },
      ]).toArray(),

      // 4+5. Coupon breakdown
      couponsCol
        .find(
          { deletedAt: { $exists: false } },
          { projection: { code: 1, description: 1, totalUsed: 1, totalReserved: 1 } }
        )
        .toArray(),
    ]);

    const pendingFeedbacks = Math.max(0, totalFeedbacks - approvedFeedbacks - rejectedFeedbacks);

    const revenueData = (revenueAgg as { totalRevenue?: number; totalDiscount?: number }[])[0];
    const totalRevenue = revenueData?.totalRevenue ?? 0;
    const totalDiscount = revenueData?.totalDiscount ?? 0;

    const avgData = (avgBookingsAgg as { totalDays?: number; totalBookings?: number }[])[0];
    const totalDays = avgData?.totalDays ?? 1;
    const totalBookingsForAvg = avgData?.totalBookings ?? 0;
    const avgBookingsPerDay = totalDays > 0 ? Math.round((totalBookingsForAvg / totalDays) * 10) / 10 : 0;

    const denominator = onlineCustomersCount + onlineConfirmedCount;
    const showOffRate = denominator > 0 ? Math.round((onlineCustomersCount / denominator) * 1000) / 10 : 0;

    const couponBreakdown = (couponDocs as { code?: string; description?: string; totalUsed?: number; totalReserved?: number }[]).map((c) => ({
      code: c.code ?? "",
      description: c.description ?? "",
      totalUsed: c.totalUsed ?? 0,
      totalReserved: c.totalReserved ?? 0,
    }));

    const totalCouponsRedeemed = couponBreakdown.reduce((s, c) => s + c.totalUsed, 0);
    const totalCouponsReserved = couponBreakdown.reduce((s, c) => s + c.totalReserved, 0);

    const busyHours = (busyHoursAgg as { _id?: string; count?: number }[]).map((b) => ({
      slot: b._id ?? "",
      count: b.count ?? 0,
    }));

    const stats: DashboardStats = {
      verifiedUsersCount,
      onlineCustomersCount,
      offlineCustomersCount,
      totalRevenue,
      totalDiscount,
      avgBookingsPerDay,
      showOffRate,
      totalFeedbacks,
      approvedFeedbacks,
      rejectedFeedbacks,
      pendingFeedbacks,
      totalCouponsRedeemed,
      totalCouponsReserved,
      couponBreakdown,
      busyHours,
    };

    res.status(200).json({ message: "Dashboard stats", data: stats });
  } catch (err) {
    console.error("[dashboard] Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
}
