import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/rbac.middleware";

const adminRouter = Router();

adminRouter.get("/dashboard", authenticate, requireRoles("admin", "staff"), (_req, res) => {
  res.status(200).json({
    message: "Unified admin dashboard scaffold is ready",
    data: {
      modules: ["auth", "bookings", "coupons", "feedback", "videos"],
    },
  });
});

export { adminRouter };
