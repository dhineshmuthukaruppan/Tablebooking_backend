import type { Request, Response } from "express";
import { submitFeedbackHandler as submitHandler } from "./feedback.handler";

export function listFeedbackHandler(_req: Request, res: Response): void {
  res.status(200).json({
    message: "Feedback and gallery listing scaffold is ready",
    data: [],
  });
}

export { getFeedbackByBookingIdHandler } from "./feedback.handler";
export const submitFeedbackHandler = submitHandler;
