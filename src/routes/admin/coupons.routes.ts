import { Router } from "express";
import { auth } from "../../services";
import * as adminController from "../../controllers/admin";

const router = Router();

router.get(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin"),
  adminController.listAdminCouponsHandler
);

router.post(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin"),
  adminController.createCouponHandler
);

router.patch(
  "/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin"),
  adminController.updateCouponHandler
);

router.delete(
  "/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin"),
  adminController.softDeleteCouponHandler
);

export const adminCouponsRoutes = router;

