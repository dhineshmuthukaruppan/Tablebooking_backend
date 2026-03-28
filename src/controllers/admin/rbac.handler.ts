/**
 * RBAC handler – manage staff route permissions.
 * GET  /admin/rbac/permissions  → return current allowedRoutes for role=staff
 * PUT  /admin/rbac/permissions  → overwrite allowedRoutes for role=staff
 * Admin-only endpoints.
 */
import type { Request, Response } from "express";
import db from "../../databaseUtilities";

/** All frontend routes that can be granted/revoked for staff. */
export const ALL_STAFF_ROUTES = [
  "/admin",
  "/admin/master/table-master",
  "/admin/master/offer-coupon",
  "/admin/venue-master",
  "/admin/master/meal-time",
  "/admin/master/general-master",
  "/admin/booking-platform",
  "/admin/photo-upload",
  "/admin/bookings",
  "/admin/approval-feedback",
  "/admin/approval-images",
  "/admin/coupons",
  "/admin/youtube-video",
  "/admin/menu/categories",
  "/admin/menu/products",
] as const;

/** Default: all routes allowed when no config exists yet. */
const DEFAULT_ALLOWED_ROUTES: string[] = [...ALL_STAFF_ROUTES];

interface StaffPermissionsDoc {
  role: string;
  allowedRoutes: string[];
  updatedAt?: Date;
  createdAt?: Date;
}

export async function getStaffPermissionsHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const doc = (await db.read.findOne({
      req,
      connectionString,
      collection: "staff_permissions",
      query: { role: "staff" },
    })) as StaffPermissionsDoc | null;

    const allowedRoutes = doc?.allowedRoutes ?? DEFAULT_ALLOWED_ROUTES;
    res.status(200).json({ data: { allowedRoutes } });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function putStaffPermissionsHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { allowedRoutes?: unknown };
    if (!Array.isArray(body.allowedRoutes)) {
      res.status(400).json({ message: "allowedRoutes must be an array of strings" });
      return;
    }
    const allowedRoutes = body.allowedRoutes.filter(
      (r): r is string => typeof r === "string"
    );

    const connectionString = db.constants.connectionStrings.tableBooking;
    const existing = await db.read.findOne({
      req,
      connectionString,
      collection: "staff_permissions",
      query: { role: "staff" },
    });

    const now = new Date();
    if (existing) {
      await db.update.updateOne({
        req,
        connectionString,
        collection: "staff_permissions",
        query: { role: "staff" },
        update: { $set: { allowedRoutes, updatedAt: now } },
      });
    } else {
      await db.create.insertOne({
        req,
        connectionString,
        collection: "staff_permissions",
        payload: { role: "staff", allowedRoutes, createdAt: now, updatedAt: now },
      });
    }

    res.status(200).json({ message: "Staff permissions updated", data: { allowedRoutes } });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}
