/**
 * Coupons routes – list (public), redeem (authenticated).
 */
import { Router } from "express";
import { auth } from "../../services";
import * as couponsController from "../../controllers/coupons";

const router = Router();

router.get("/", couponsController.listCouponsHandler);
router.get("/redeemed", auth.authentication.authenticate, couponsController.listMyRedeemedCouponIdsHandler);
router.post("/redeem", auth.authentication.authenticate, couponsController.redeemCouponHandler);

export const couponsRoutes = router;
