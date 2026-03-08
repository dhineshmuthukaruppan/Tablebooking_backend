/**
 * Main route aggregator. Imports domain route folders and mounts under /api/v1.
 * See BACKEND_STRUCTURE_GUIDE.md. No src/modules layer.
 */
import { Router } from "express";
import { auth } from "../services";
import * as tableMasterController from "../controllers/admin/master/table-master.handler";
import { authRoutes } from "./auth/auth.routes";
import { userRegistrationRoutes } from "./user_registration/user_registration.routes";
import { adminRoutes } from "./admin/admin.routes";
import { bookingsRoutes } from "./bookings/bookings.routes";
import { couponsRoutes } from "./coupons/coupons.routes";
import { feedbackRoutes } from "./feedback/feedback.routes";
import { videosRoutes } from "./videos/videos.routes";

const v1Router = Router();

v1Router.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "table-booking-backend",
    version: "v1",
    routesRevision: "table-master-2024", // change this after fixing table-master to confirm restart
    time: new Date().toISOString(),
  });
});

// Auth: signin + me; user_registration: register (both under /auth)
v1Router.use("/auth", userRegistrationRoutes);
v1Router.use("/auth", authRoutes);

// Table master: register as direct GET/PUT so path matching is unambiguous (no nested router)
v1Router.get(
  "/admin/master/table-master",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  tableMasterController.getTableMasterConfigHandler
);
v1Router.put(
  "/admin/master/table-master",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  tableMasterController.putTableMasterConfigHandler
);

v1Router.use("/admin", adminRoutes);
v1Router.use("/bookings", bookingsRoutes);
v1Router.use("/coupons", couponsRoutes);
v1Router.use("/feedback", feedbackRoutes);
v1Router.use("/videos", videosRoutes);

export { v1Router };
