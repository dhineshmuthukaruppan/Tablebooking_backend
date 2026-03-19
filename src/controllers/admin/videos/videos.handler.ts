import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import db from "../../../databaseUtilities";
import { extractYouTubeId, youtubeThumbnailUrl } from "../../../lib/videos/youtube";

function isObjectIdLike(v: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(v);
}

export async function adminListVideosHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const categoryIdParam = typeof req.query.categoryId === "string" ? req.query.categoryId.trim() : "";
    const featuredParam = typeof req.query.featured === "string" ? req.query.featured.trim() : "";
    const publishedParam = typeof req.query.published === "string" ? req.query.published.trim() : "";

    const query: Record<string, unknown> = {};
    if (categoryIdParam && isObjectIdLike(categoryIdParam)) query.categoryId = new ObjectId(categoryIdParam);
    if (featuredParam) query.isFeatured = featuredParam.toLowerCase() === "true" || featuredParam === "1";
    if (publishedParam) query.isPublished = publishedParam.toLowerCase() === "true" || publishedParam === "1";

    const list = await db.read.find({
      req,
      connectionString,
      collection: "videos",
      query,
      sort: { order: 1, createdAt: -1 },
    });

    res.status(200).json({ message: "Videos", data: Array.isArray(list) ? list : [] });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function adminCreateVideoHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    const youtubeUrl = typeof req.body?.youtubeUrl === "string" ? req.body.youtubeUrl.trim() : "";
    const categoryIdStr = typeof req.body?.categoryId === "string" ? req.body.categoryId.trim() : "";

    if (!title) {
      res.status(400).json({ message: "Title is required" });
      return;
    }
    if (!youtubeUrl) {
      res.status(400).json({ message: "YouTube URL is required" });
      return;
    }
    if (!categoryIdStr || !isObjectIdLike(categoryIdStr)) {
      res.status(400).json({ message: "Valid categoryId is required" });
      return;
    }

    const categoryId = new ObjectId(categoryIdStr);
    const category = await db.read.findOne({
      req,
      connectionString,
      collection: "video_categories",
      query: { _id: categoryId },
    });
    if (!category?._id) {
      res.status(400).json({ message: "Category not found" });
      return;
    }

    const youtubeId = extractYouTubeId(youtubeUrl);
    if (!youtubeId) {
      res.status(400).json({ message: "Invalid YouTube URL" });
      return;
    }

    const isPublished = req.body?.isPublished === false ? false : true;
    const isFeatured = req.body?.isFeatured === true;
    const order = Number.isFinite(Number(req.body?.order)) ? Number(req.body.order) : 0;

    let featuredOrder: number | undefined = undefined;
    if (isFeatured) {
      const fo = Number(req.body?.featuredOrder);
      featuredOrder = Number.isFinite(fo) ? fo : undefined;
      if (featuredOrder === undefined) {
        const maxFeatured = await db.read.find({
          req,
          connectionString,
          collection: "videos",
          query: { isFeatured: true },
          sort: { featuredOrder: -1 },
          limit: 1,
        });
        const currentMax = (maxFeatured?.[0] as any)?.featuredOrder;
        featuredOrder = Number.isFinite(Number(currentMax)) ? Number(currentMax) + 1 : 1;
      }
    }

    const now = new Date();
    const payload = {
      title,
      description: description || undefined,
      provider: "youtube",
      youtubeId,
      youtubeUrl,
      thumbnailUrl: youtubeThumbnailUrl(youtubeId),
      categoryId,
      isPublished,
      isFeatured,
      featuredOrder: isFeatured ? featuredOrder : undefined,
      order,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.create.insertOne({
      req,
      connectionString,
      collection: "videos",
      payload,
    });

    res.status(201).json({ message: "Video created", data: { _id: result.insertedId, ...payload } });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function adminPatchVideoHandler(req: Request, res: Response): Promise<void> {
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
      collection: "videos",
      query: { _id },
    });
    if (!existing?._id) {
      res.status(404).json({ message: "Video not found" });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (typeof req.body?.title === "string") {
      const t = req.body.title.trim();
      if (!t) {
        res.status(400).json({ message: "Title is required" });
        return;
      }
      updates.title = t;
    }
    if (typeof req.body?.description === "string") {
      const d = req.body.description.trim();
      updates.description = d || undefined;
    }
    if (typeof req.body?.youtubeUrl === "string") {
      const url = req.body.youtubeUrl.trim();
      if (!url) {
        res.status(400).json({ message: "YouTube URL is required" });
        return;
      }
      const youtubeId = extractYouTubeId(url);
      if (!youtubeId) {
        res.status(400).json({ message: "Invalid YouTube URL" });
        return;
      }
      updates.youtubeUrl = url;
      updates.youtubeId = youtubeId;
      updates.thumbnailUrl = youtubeThumbnailUrl(youtubeId);
      updates.provider = "youtube";
    }
    if (typeof req.body?.categoryId === "string") {
      const cid = req.body.categoryId.trim();
      if (!cid || !isObjectIdLike(cid)) {
        res.status(400).json({ message: "Valid categoryId is required" });
        return;
      }
      const categoryId = new ObjectId(cid);
      const cat = await db.read.findOne({
        req,
        connectionString,
        collection: "video_categories",
        query: { _id: categoryId },
      });
      if (!cat?._id) {
        res.status(400).json({ message: "Category not found" });
        return;
      }
      updates.categoryId = categoryId;
    }
    if (typeof req.body?.isPublished === "boolean") updates.isPublished = req.body.isPublished;
    if (req.body?.order !== undefined) {
      const order = Number(req.body.order);
      if (!Number.isFinite(order)) {
        res.status(400).json({ message: "Invalid order" });
        return;
      }
      updates.order = order;
    }
    if (typeof req.body?.isFeatured === "boolean") {
      updates.isFeatured = req.body.isFeatured;
      if (!req.body.isFeatured) {
        updates.featuredOrder = undefined;
      } else {
        const fo = Number(req.body?.featuredOrder);
        if (Number.isFinite(fo)) updates.featuredOrder = fo;
      }
    } else if (req.body?.featuredOrder !== undefined) {
      const fo = Number(req.body.featuredOrder);
      if (!Number.isFinite(fo)) {
        res.status(400).json({ message: "Invalid featuredOrder" });
        return;
      }
      updates.featuredOrder = fo;
      updates.isFeatured = true;
    }

    if (Object.keys(updates).length === 0) {
      res.status(200).json({ message: "No changes" });
      return;
    }

    updates.updatedAt = new Date();
    await db.update.updateOne({
      req,
      connectionString,
      collection: "videos",
      query: { _id },
      update: { $set: updates },
    });

    const updated = await db.read.findOne({
      req,
      connectionString,
      collection: "videos",
      query: { _id },
    });
    res.status(200).json({ message: "Video updated", data: updated });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function adminDeleteVideoHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const id = typeof req.params?.id === "string" ? req.params.id.trim() : "";
    if (!id || !isObjectIdLike(id)) {
      res.status(400).json({ message: "Invalid id" });
      return;
    }
    const _id = new ObjectId(id);

    const result = await db.deleteOp.deleteOne({
      req,
      connectionString,
      collection: "videos",
      query: { _id },
    });
    if (!result.deletedCount) {
      res.status(404).json({ message: "Video not found" });
      return;
    }

    res.status(200).json({ message: "Video deleted" });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function adminReorderVideosHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items || items.length === 0) {
      res.status(400).json({ message: "items is required" });
      return;
    }

    for (const item of items) {
      const id = typeof item?.id === "string" ? item.id.trim() : "";
      const order = Number(item?.order);
      if (!id || !isObjectIdLike(id) || !Number.isFinite(order)) continue;
      await db.update.updateOne({
        req,
        connectionString,
        collection: "videos",
        query: { _id: new ObjectId(id) },
        update: { $set: { order, updatedAt: new Date() } },
      });
    }

    res.status(200).json({ message: "Reordered" });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function adminReorderFeaturedVideosHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items || items.length === 0) {
      res.status(400).json({ message: "items is required" });
      return;
    }

    for (const item of items) {
      const id = typeof item?.id === "string" ? item.id.trim() : "";
      const featuredOrder = Number(item?.featuredOrder);
      if (!id || !isObjectIdLike(id) || !Number.isFinite(featuredOrder)) continue;
      await db.update.updateOne({
        req,
        connectionString,
        collection: "videos",
        query: { _id: new ObjectId(id) },
        update: { $set: { isFeatured: true, featuredOrder, updatedAt: new Date() } },
      });
    }

    res.status(200).json({ message: "Featured reordered" });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

