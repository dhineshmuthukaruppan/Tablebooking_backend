import type { Request, Response } from "express";

export function listVideosHandler(_req: Request, res: Response): void {
  res.status(200).json({
    message: "Public videos listing scaffold is ready",
    data: [],
  });
}

export function createVideoHandler(_req: Request, res: Response): void {
  res.status(201).json({
    message: "Admin video CMS scaffold endpoint",
  });
}
