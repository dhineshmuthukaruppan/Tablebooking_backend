import type { Request, Response } from "express";
import db from "../../databaseUtilities";

export async function listVideoCategoriesHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const list = await db.read.find({
      req,
      connectionString,
      collection: "video_categories",
      query: { isActive: { $ne: false } },
      sort: { order: 1, name: 1 },
    });

    res.status(200).json({
      message: "Video categories",
      data: Array.isArray(list) ? list : [],
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

