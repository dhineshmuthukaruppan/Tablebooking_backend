import type { Request, Response } from "express";

export function getMeHandler(req: Request, res: Response): void {
  res.status(200).json({
    message: "Authenticated user profile",
    data: req.user,
  });
}
