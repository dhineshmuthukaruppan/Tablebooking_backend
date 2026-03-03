import { Router } from "express";
import { adminRouter } from "../modules/admin/admin.routes";
import { authRouter } from "../modules/auth/auth.routes";
import { bookingsRouter } from "../modules/bookings/bookings.routes";
import { couponsRouter } from "../modules/coupons/coupons.routes";
import { feedbackRouter } from "../modules/feedback/feedback.routes";
import { videosRouter } from "../modules/videos/videos.routes";

const v1Router = Router();

v1Router.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "table-booking-backend",
    version: "v1",
    time: new Date().toISOString(),
  });
});

v1Router.use("/auth", authRouter);
v1Router.use("/bookings", bookingsRouter);
v1Router.use("/coupons", couponsRouter);
v1Router.use("/feedback", feedbackRouter);
v1Router.use("/videos", videosRouter);
v1Router.use("/admin", adminRouter);

export { v1Router };
