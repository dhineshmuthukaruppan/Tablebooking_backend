/**
 * General master config. Base path: /admin/master/general-master
 */
import { Router } from "express";
import { auth } from "../../../services";
import * as masterController from "../../../controllers/admin/master";

const router = Router();

router.get(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  masterController.getGeneralMasterConfigHandler
);

router.put(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  masterController.updateGeneralMasterConfigHandler
);

router.patch(
  "/admin-email",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  masterController.updateGeneralMasterAdminEmailHandler
);

export const generalMasterRoutes = router;
