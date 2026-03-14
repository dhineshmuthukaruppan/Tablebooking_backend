/**
 * Admin routes – dashboard, users (list, update), master (guest-dates, meal-time), bookings (patch).
 * RBAC: dashboard requires admin or staff; users list/patch require admin.
 */
import { Router } from "express";
import { auth } from "../../services";
import * as adminController from "../../controllers/admin";
import { masterRoutes } from "./master";
import { menuAdminRoutes } from "./menu.routes";

const router = Router();

router.post(
  "/bookings/list",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminController.listAdminBookingsHandler
);

router.patch(
  "/bookings/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminController.patchBookingByAdminHandler
);

router.post(
  "/bookings/walk-in",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminController.postWalkInPaymentHandler
);

router.get(
  "/dashboard",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminController.dashboardHandler
);

router.get(
  "/users",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin"),
  adminController.getUsersHandler
);

router.patch(
  "/users/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin"),
  adminController.patchUserHandler
);

router.use("/master", masterRoutes);
router.use("/menu", menuAdminRoutes);

router.get(
  "/feedback",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminController.getAdminFeedbackHandler
);

router.patch(
  "/feedback/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminController.patchAdminFeedbackHandler
);

router.post(
  "/jobs/cleanup-slot-inventory",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminController.cleanupSlotInventoryHandler
);

export const adminRoutes = router;
