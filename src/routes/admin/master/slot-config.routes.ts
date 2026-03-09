/**
 * Slot config versioning. Base path: /admin/master/slot-config
 */
import { Router } from "express";
import { auth } from "../../../services";
import * as slotConfigController from "../../../controllers/admin/master/slot-config.handler";

const router = Router();

router.post(
  "/preview",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  slotConfigController.previewSlotConfigHandler
);

router.post(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  slotConfigController.createSlotConfigHandler
);

export const slotConfigRoutes = router;
