/**
 * Admin master routes – guest-dates, meal-time, table-master.
 * Base path: /admin/master
 */
import { Router } from "express";
import { guestDatesRoutes } from "./guest-dates.routes";
import { mealTimeRoutes } from "./meal-time.routes";
import { tableMasterRoutes } from "./table-master.routes";

const router = Router();

router.use("/guest-dates", guestDatesRoutes);
router.use("/meal-time", mealTimeRoutes);
router.use("/table-master", tableMasterRoutes);

export const masterRoutes = router;
