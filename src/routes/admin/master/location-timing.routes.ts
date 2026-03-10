/**
 * Location and timing. Base path: /admin/master/location-timing
 */
import { Router } from "express";
import { auth } from "../../../services";
import * as masterController from "../../../controllers/admin/master";

const router = Router();

router.get(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  masterController.getLocationTimingHandler
);

router.put(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  masterController.putLocationTimingHandler
);

export const locationTimingRoutes = router;
