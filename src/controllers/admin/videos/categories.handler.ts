import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import db from "../../../databaseUtilities";
import { toSlug } from "../../../lib/videos/slug";

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
      sort: { order: 1, name: 1 },
    });
    res.status(200).json({ message: "Video categories", data: Array.isArray(list) ? list : [] });
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
    const order = Number.isFinite(Number(req.body?.order)) ? Number(req.body.order) : 0;

    if (!name) {
      res.status(400).json({ message: "Category name is required" });
      return;
    }

    const slugInput = typeof req.body?.slug === "string" ? req.body.slug.trim() : "";
    const slug = toSlug(slugInput || name);
    if (!slug) {
      res.status(400).json({ message: "Invalid category slug" });
      return;
    }

    const existing = await db.read.findOne({
      req,
      connectionString,
      collection: "video_categories",
      query: { slug },
    });
    if (existing?._id) {
      res.status(409).json({ message: "Category slug already exists" });
      return;
    }

    const now = new Date();
    const payload = {
      name,
      slug,
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

    res.status(201).json({ message: "Category created", data: { _id: result.insertedId, ...payload } });
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
      if (!Number.isFinite(order)) {
        res.status(400).json({ message: "Invalid order" });
        return;
      }
      updates.order = order;
    }
    if (typeof req.body?.slug === "string") {
      const slug = toSlug(req.body.slug.trim());
      if (!slug) {
        res.status(400).json({ message: "Invalid slug" });
        return;
      }
      const conflict = await db.read.findOne({
        req,
        connectionString,
        collection: "video_categories",
        query: { slug, _id: { $ne: _id } },
      });
      if (conflict?._id) {
        res.status(409).json({ message: "Category slug already exists" });
        return;
      }
      updates.slug = slug;
    } else if (updates.name && !(existing as any).slug) {
      // Ensure slug exists if an old record had none.
      const slug = toSlug(String(updates.name));
      if (slug) updates.slug = slug;
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

    res.status(200).json({ message: "Category updated", data: updated });
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

