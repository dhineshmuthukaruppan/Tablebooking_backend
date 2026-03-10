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

router.get(
  "/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  masterController.getMealTimeByIdHandler
);

router.post(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  masterController.addMealTimeHandler
);

router.put(
  "/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  masterController.updateMealTimeHandler
);

router.delete(
  "/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  masterController.deleteMealTimeHandler
);

export const mealTimeRoutes = router;
