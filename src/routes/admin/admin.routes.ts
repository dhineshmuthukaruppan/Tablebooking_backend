/**
 * Admin routes – dashboard, users (list, update), master (general-master, meal-time), bookings (patch).
 * RBAC: dashboard requires admin or staff/manager; users list/patch require admin.
 */
import { Router } from "express";
import { auth } from "../../services";
import * as adminController from "../../controllers/admin";
import { masterRoutes } from "./master";
import { menuAdminRoutes } from "./menu.routes";
import { adminCouponsRoutes } from "./coupons.routes";
import { adminVideosRoutes } from "./videos.routes";

const router = Router();

router.post(
  "/bookings/list",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff", "manager"),
  adminController.listAdminBookingsHandler
);

router.post(
  "/bookings/export",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff", "manager"),
  adminController.exportAdminBookingsHandler
);

router.patch(
  "/bookings/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff", "manager"),
  adminController.patchBookingByAdminHandler
);

router.post(
  "/bookings/walk-in",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff", "manager"),
  adminController.postWalkInPaymentHandler
);

router.get(
  "/table-allocations",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff", "manager"),
  adminController.getTableAllocationsHandler
);
router.post(
  "/table-allocations",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff", "manager"),
  adminController.postTableAllocationsHandler
);
router.delete(
  "/table-allocations",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff", "manager"),
  adminController.deleteTableAllocationsHandler
);
router.delete(
  "/table-allocations/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff", "manager"),
  adminController.deleteTableAllocationsHandler
);

router.get(
  "/dashboard",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff", "manager"),
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

// Staff RBAC permissions
router.get(
  "/rbac/permissions",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminController.getStaffPermissionsHandler
);

router.put(
  "/rbac/permissions",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin"),
  adminController.putStaffPermissionsHandler
);

// Manager RBAC permissions
router.get(
  "/rbac/permissions/manager",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "manager"),
  adminController.getManagerPermissionsHandler
);

router.put(
  "/rbac/permissions/manager",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin"),
  adminController.putManagerPermissionsHandler
);

router.use("/master", masterRoutes);
router.use("/menu", menuAdminRoutes);
router.use("/coupons", adminCouponsRoutes);
router.use("/", adminVideosRoutes);

router.get(
  "/feedback",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff", "manager"),
  adminController.getAdminFeedbackHandler
);

router.patch(
  "/feedback/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff", "manager"),
  adminController.patchAdminFeedbackHandler
);

router.post(
  "/jobs/cleanup-slot-inventory",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff", "manager"),
  adminController.cleanupSlotInventoryHandler
);

export const adminRoutes = router;
