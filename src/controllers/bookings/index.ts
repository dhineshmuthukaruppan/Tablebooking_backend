import type { Request, Response } from "express";

export function listBookingsHandler(_req: Request, res: Response): void {
  res.status(200).json({
    message: "Bookings module scaffold is ready",
    data: [],
  });
}
