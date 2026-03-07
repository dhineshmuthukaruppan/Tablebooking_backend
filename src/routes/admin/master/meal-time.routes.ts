/**
 * Meal-time sections. Base path: /admin/master/meal-time
 */
import { Router } from "express";
import { auth } from "../../../services";
import * as masterController from "../../../controllers/admin/master";

const router = Router();

router.get(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  masterController.getMealTimeListHandler
);

router.post(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  masterController.addMealTimeHandler
);

export const mealTimeRoutes = router;
