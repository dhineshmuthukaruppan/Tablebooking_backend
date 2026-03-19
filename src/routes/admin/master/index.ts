/**
 * Admin master routes – general-master, meal-time, table-master, location-timing, facilities.
 * Base path: /admin/master
 */
import { Router } from "express";
import { generalMasterRoutes } from "./general-master.routes";
import { mealTimeRoutes } from "./meal-time.routes";
import { tableMasterRoutes } from "./table-master.routes";
import { locationTimingRoutes } from "./location-timing.routes";
import { facilitiesRoutes } from "./facilities.routes";
import { slotConfigRoutes } from "./slot-config.routes";

const router = Router();

router.use("/general-master", generalMasterRoutes);
router.use("/meal-time", mealTimeRoutes);
router.use("/table-master", tableMasterRoutes);
router.use("/location-timing", locationTimingRoutes);
router.use("/facilities", facilitiesRoutes);
router.use("/slot-config", slotConfigRoutes);

export const masterRoutes = router;
