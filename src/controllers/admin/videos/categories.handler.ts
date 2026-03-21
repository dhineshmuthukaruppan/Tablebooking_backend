import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import db from "../../../databaseUtilities";

function isObjectIdLike(v: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(v);
}

export async function adminListVideoCategoriesHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const list = await db.read.find({
      req,
      connectionString,
      collection: "video_categories",
      query: {},
      sort: { order: 1, createdAt: -1, name: 1 },
    });
    const data = (Array.isArray(list) ? list : []).map((c) => {
      const cat = c as {
        _id?: ObjectId;
        name?: string;
        description?: string;
        isActive?: boolean;
        order?: number;
      };
      return {
        _id: cat._id?.toString(),
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

export async function adminCreateVideoCategoryHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    const isActive = req.body?.isActive === false ? false : true;

    if (!name) {
      res.status(400).json({ message: "Category name is required" });
      return;
    }

    const maxOrderDocs = await db.read.find({
      req,
      connectionString,
      collection: "video_categories",
      query: {},
      sort: { order: -1, createdAt: -1 },
      limit: 1,
    });
    const maxOrder = Array.isArray(maxOrderDocs) && maxOrderDocs.length > 0 ? (maxOrderDocs[0] as any)?.order : undefined;
    const order = Number.isFinite(Number(maxOrder)) ? Number(maxOrder) + 1 : 1;

    const now = new Date();
    const payload = {
      name,
      description: description || undefined,
      isActive,
      order,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.create.insertOne({
      req,
      connectionString,
      collection: "video_categories",
      payload,
    });

    res.status(201).json({
      message: "Category created",
      data: { _id: result.insertedId.toString(), ...payload, order: payload.order },
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function adminPatchVideoCategoryHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const id = typeof req.params?.id === "string" ? req.params.id.trim() : "";
    if (!id || !isObjectIdLike(id)) {
      res.status(400).json({ message: "Invalid id" });
      return;
    }
    const _id = new ObjectId(id);

    const existing = await db.read.findOne({
      req,
      connectionString,
      collection: "video_categories",
      query: { _id },
    });
    if (!existing?._id) {
      res.status(404).json({ message: "Category not found" });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (typeof req.body?.name === "string") {
      const name = req.body.name.trim();
      if (!name) {
        res.status(400).json({ message: "Category name is required" });
        return;
      }
      updates.name = name;
    }
    if (typeof req.body?.description === "string") {
      const d = req.body.description.trim();
      updates.description = d || undefined;
    }
    if (typeof req.body?.isActive === "boolean") updates.isActive = req.body.isActive;
    if (req.body?.order !== undefined) {
      const order = Number(req.body.order);
      if (!Number.isFinite(order) || order < 1) {
        res.status(400).json({ message: "Invalid order" });
        return;
      }
      updates.order = order;
    }

    if (Object.keys(updates).length === 0) {
      res.status(200).json({ message: "No changes" });
      return;
    }

    updates.updatedAt = new Date();
    await db.update.updateOne({
      req,
      connectionString,
      collection: "video_categories",
      query: { _id },
      update: { $set: updates },
    });

    const updated = await db.read.findOne({
      req,
      connectionString,
      collection: "video_categories",
      query: { _id },
    });

    res.status(200).json({
      message: "Category updated",
      data: updated
        ? {
            _id: (updated as any)._id?.toString?.() ?? (updated as any)._id,
            name: (updated as any).name,
            description: (updated as any).description,
            isActive: (updated as any).isActive,
            order: (updated as any).order,
          }
        : null,
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function adminDeleteVideoCategoryHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const id = typeof req.params?.id === "string" ? req.params.id.trim() : "";
    if (!id || !isObjectIdLike(id)) {
      res.status(400).json({ message: "Invalid id" });
      return;
    }
    const _id = new ObjectId(id);

    const usedBy = await db.read.count({
      req,
      connectionString,
      collection: "videos",
      query: { categoryId: _id },
    });
    if (usedBy > 0) {
      res.status(409).json({ message: "Category is used by videos. Move videos to another category first." });
      return;
    }

    const result = await db.deleteOp.deleteOne({
      req,
      connectionString,
      collection: "video_categories",
      query: { _id },
    });
    if (!result.deletedCount) {
      res.status(404).json({ message: "Category not found" });
      return;
    }

    res.status(200).json({ message: "Category deleted" });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function adminReorderVideoCategoriesHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items || items.length === 0) {
      res.status(200).json({ message: "No changes" });
      return;
    }

    const ids: string[] = [];
    for (const item of items) {
      const id = typeof item?.id === "string" ? item.id.trim() : "";
      if (id && isObjectIdLike(id)) ids.push(id);
    }
    if (ids.length === 0) {
      res.status(200).json({ message: "No changes" });
      return;
    }

    const now = new Date();
    for (let i = 0; i < ids.length; i++) {
      const _id = new ObjectId(ids[i]);
      await db.update.updateOne({
        req,
        connectionString,
        collection: "video_categories",
        query: { _id },
        update: { $set: { order: i + 1, updatedAt: now } },
      });
    }

    res.status(200).json({ message: "Categories reordered" });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

