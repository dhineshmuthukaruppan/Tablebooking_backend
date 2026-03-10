import type { Request, Response } from "express";

export function listCouponsHandler(_req: Request, res: Response): void {
  res.status(200).json({
    message: "Public coupons listing scaffold is ready",
    data: [],
  });
}

export function redeemCouponHandler(_req: Request, res: Response): void {
  res.status(200).json({
    message: "Coupon redemption scaffold endpoint",
  });
}
