import type { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger";

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error("Unhandled API error", error);
  res.status(500).json({
    message: "Internal server error",
  });
}
