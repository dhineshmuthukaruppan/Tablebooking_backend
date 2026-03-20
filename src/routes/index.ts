/**
 * V1 route aggregator. Imports domain route folders for API version 1.
 * Mounted under /api/v1 by the api route aggregator (api.routes.ts).
 * See BACKEND_STRUCTURE_GUIDE.md. No src/modules layer.
 */
import { Router } from "express";
import * as venueController from "../controllers/venue.handler";
import { authRoutes } from "./auth/auth.routes";
import { userRegistrationRoutes } from "./user_registration/user_registration.routes";
import { adminRoutes } from "./admin/admin.routes";
import { bookingsRoutes } from "./bookings/bookings.routes";
import { couponsRoutes } from "./coupons/coupons.routes";
import { feedbackRoutes } from "./feedback/feedback.routes";
import { videosRoutes } from "./videos/videos.routes";
import { videoCategoriesRoutes } from "./video-categories/video-categories.routes";
import { photosRoutes } from "./photos/photos.routes";
import { menuRoutes } from "./menu/menu.routes";
import { usermanagementRoutes } from "./usermanagement/usermanagement.routes";

const v1Router = Router();

// Public: venue config for landing page (location, timing, facilities)
v1Router.get("/venue/config", venueController.getVenueConfigHandler);

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

// Table master: served via admin/master/table-master.routes. Ping for route confirmation.
v1Router.get("/admin/master/table-master-ping", (_req, res) =>
  res.status(200).json({ tableMasterRoute: "registered" })
);

v1Router.use("/admin", adminRoutes);
v1Router.use("/usermanagement", usermanagementRoutes);
v1Router.use("/bookings", bookingsRoutes);
v1Router.use("/coupons", couponsRoutes);
v1Router.use("/feedback", feedbackRoutes);
v1Router.use("/videos", videosRoutes);
v1Router.use("/video-categories", videoCategoriesRoutes);
v1Router.use("/photos", photosRoutes);
v1Router.use("/menu", menuRoutes);

export { v1Router };
