/**
 * Admin master routes – guest-dates, meal-time.
 * Base path: /admin/master
 */
import { Router } from "express";
import { guestDatesRoutes } from "./guest-dates.routes";
import { mealTimeRoutes } from "./meal-time.routes";

const router = Router();

router.use("/guest-dates", guestDatesRoutes);
router.use("/meal-time", mealTimeRoutes);

export const masterRoutes = router;
