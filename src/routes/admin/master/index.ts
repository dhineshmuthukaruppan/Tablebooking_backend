/**
 * Admin master routes – guest-dates, meal-time, table-master, location-timing, facilities.
 * Base path: /admin/master
 */
import { Router } from "express";
import { guestDatesRoutes } from "./guest-dates.routes";
import { mealTimeRoutes } from "./meal-time.routes";
import { tableMasterRoutes } from "./table-master.routes";
import { locationTimingRoutes } from "./location-timing.routes";
import { facilitiesRoutes } from "./facilities.routes";

const router = Router();

router.use("/guest-dates", guestDatesRoutes);
router.use("/meal-time", mealTimeRoutes);
router.use("/table-master", tableMasterRoutes);
router.use("/location-timing", locationTimingRoutes);
router.use("/facilities", facilitiesRoutes);

export const masterRoutes = router;
