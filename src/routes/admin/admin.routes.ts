/**
 * Admin routes – dashboard, users (list, update), master (guest-dates, meal-time).
 * RBAC: dashboard requires admin or staff; users list/patch require admin.
 */
import { Router } from "express";
import { auth } from "../../services";
import * as adminController from "../../controllers/admin";
import { masterRoutes } from "./master";

const router = Router();

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

export const adminRoutes = router;
