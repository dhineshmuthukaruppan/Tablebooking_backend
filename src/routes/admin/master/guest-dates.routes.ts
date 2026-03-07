/**
 * Guest-dates config. Base path: /admin/master/guest-dates
 */
import { Router } from "express";
import { auth } from "../../../services";
import * as masterController from "../../../controllers/admin/master";

const router = Router();

router.get(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  masterController.getGuestDatesConfigHandler
);

router.put(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  masterController.updateGuestDatesConfigHandler
);

export const guestDatesRoutes = router;
