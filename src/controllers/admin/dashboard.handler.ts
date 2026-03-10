import type { Request, Response } from "express";

export async function dashboardHandler(_req: Request, res: Response): Promise<void> {
  res.status(200).json({
    message: "Unified admin dashboard scaffold is ready",
    data: {
      modules: ["auth", "bookings", "coupons", "feedback", "videos"],
    },
  });
}
