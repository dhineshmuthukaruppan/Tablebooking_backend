import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import db from "../../databaseUtilities";

/** GET /admin/feedback — list feedbacks with server-side pagination. Query: page (1-based), limit, status (approved | not_approved). */
export async function getAdminFeedbackHandler(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? 1), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? 10), 10) || 10));
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "not_approved";

    const connectionString = db.constants.connectionStrings.tableBooking;
    const query: Record<string, unknown> =
      status === "approved"
        ? { isPublicVisible: true }
        : { $or: [{ isPublicVisible: false }, { isPublicVisible: { $exists: false } }] };

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      db.read.find({
        req,
        connectionString,
        collection: "feedbacks",
        query,
        sort: { createdAt: -1 },
        skip,
        limit,
      }),
      db.read.count({
        req,
        connectionString,
        collection: "feedbacks",
        query,
      }),
    ]);

    res.status(200).json({
      message: "Feedback list",
      data: items,
      total: total ?? 0,
      page,
      limit,
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

/** PATCH /admin/feedback/:id — set isPublicVisible and/or imageApprovals. Body: { isPublicVisible?: boolean, imageApprovals?: boolean[] } */
export async function patchAdminFeedbackHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || typeof id !== "string" || !ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid feedback ID" });
      return;
    }
    const body = req.body as { isPublicVisible?: boolean; imageApprovals?: boolean[] };
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.isPublicVisible === "boolean") update.isPublicVisible = body.isPublicVisible;
    if (Array.isArray(body.imageApprovals)) update.imageApprovals = body.imageApprovals;

    if (Object.keys(update).length <= 1) {
      res.status(400).json({ message: "No valid fields to update (isPublicVisible, imageApprovals)" });
      return;
    }

    const connectionString = db.constants.connectionStrings.tableBooking;
    const result = await db.update.findOneAndUpdate({
      req,
      connectionString,
      collection: "feedbacks",
      query: { _id: new ObjectId(id) },
      update: { $set: update },
      options: { returnDocument: "after" },
    });

    if (!result) {
      res.status(404).json({ message: "Feedback not found" });
      return;
    }
    res.status(200).json({ message: "Feedback updated", data: result });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}
