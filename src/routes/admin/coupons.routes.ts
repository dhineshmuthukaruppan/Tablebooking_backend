import { Router } from "express";
import { auth } from "../../services";
import * as adminController from "../../controllers/admin";

const router = Router();

router.get(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminController.listAdminCouponsHandler
);

router.get(
  "/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminController.getAdminCouponByIdHandler
);

router.post(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminController.createCouponHandler
);

router.patch(
  "/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminController.updateCouponHandler
);

router.delete(
  "/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminController.softDeleteCouponHandler
);

export const adminCouponsRoutes = router;

