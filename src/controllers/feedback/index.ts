import type { Request, Response } from "express";

export function listFeedbackHandler(_req: Request, res: Response): void {
  res.status(200).json({
    message: "Feedback and gallery listing scaffold is ready",
    data: [],
  });
}

export function submitFeedbackHandler(_req: Request, res: Response): void {
  res.status(201).json({
    message: "Feedback submission scaffold endpoint",
  });
}
