import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";

const couponsRouter = Router();

couponsRouter.get("/", (_req, res) => {
  res.status(200).json({
    message: "Public coupons listing scaffold is ready",
    data: [],
  });
});

couponsRouter.post("/redeem", authenticate, (_req, res) => {
  res.status(200).json({
    message: "Coupon redemption scaffold endpoint",
  });
});

export { couponsRouter };
