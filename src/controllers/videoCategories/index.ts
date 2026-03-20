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
      sort: { order: 1, createdAt: -1, name: 1 },
    });

    const data = (Array.isArray(list) ? list : []).map((c) => {
      const cat = c as {
        _id?: import("mongodb").ObjectId;
        name?: string;
        description?: string;
        isActive?: boolean;
        order?: number;
      };
      return {
        _id: cat._id,
        name: cat.name,
        description: cat.description,
        isActive: cat.isActive,
        order: cat.order,
      };
    });

    res.status(200).json({ message: "Video categories", data });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

