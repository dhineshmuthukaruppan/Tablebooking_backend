/**
 * Facilities master. Base path: /admin/master/facilities
 */
import { Router } from "express";
import { auth } from "../../../services";
import * as masterController from "../../../controllers/admin/master";

const router = Router();

router.get(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  masterController.getFacilitiesHandler
);

router.put(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  masterController.putFacilitiesHandler
);

export const facilitiesRoutes = router;
