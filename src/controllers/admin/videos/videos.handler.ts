import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import db from "../../../databaseUtilities";
import { extractYouTubeId } from "../../../lib/videos/youtube";
import { fetchYouTubePreview } from "../../../lib/videos/oembed";

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
      sort: { createdAt: -1 },
    });

    const data = (Array.isArray(list) ? list : []).map((v) => {
      const vid = v as any;
      return {
        _id: vid._id?.toString?.() ?? vid._id,
        title: vid.title,
        description: vid.description,
        provider: vid.provider,
        youtubeId: vid.youtubeId,
        youtubeUrl: vid.youtubeUrl,
        thumbnailUrl: vid.thumbnailUrl,
        categoryId: vid.categoryId?.toString?.() ?? vid.categoryId,
        isPublished: vid.isPublished,
        isFeatured: vid.isFeatured,
        order: vid.order,
        createdAt: vid.createdAt,
        updatedAt: vid.updatedAt,
      };
    });

    // Sort by category order first (if present), then by video order.
    const categoryIds = Array.from(new Set(data.map((v) => String(v.categoryId)).filter(Boolean))).filter(Boolean).map((id) => new ObjectId(id));

    const categories = categoryIds.length
      ? await db.read.find({
          req,
          connectionString,
          collection: "video_categories",
          query: { _id: { $in: categoryIds } },
        })
      : [];

    const categoryOrderMap = new Map<string, number>();
    for (const c of categories ?? []) {
      const id = (c as any)?._id?.toString?.() ?? (c as any)?._id;
      const o = (c as any)?.order;
      if (id) categoryOrderMap.set(id.toString(), Number.isFinite(Number(o)) ? Number(o) : Number.MAX_SAFE_INTEGER);
    }

    data.sort((a, b) => {
      const aCat = String(a.categoryId ?? "");
      const bCat = String(b.categoryId ?? "");
      const aCatOrder = categoryOrderMap.get(aCat) ?? Number.MAX_SAFE_INTEGER;
      const bCatOrder = categoryOrderMap.get(bCat) ?? Number.MAX_SAFE_INTEGER;
      if (aCatOrder !== bCatOrder) return aCatOrder - bCatOrder;

      const aOrder = typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
      const bOrder = typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;

      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    res.status(200).json({ message: "Videos", data });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function adminCreateVideoHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    const youtubeUrl = typeof req.body?.youtubeUrl === "string" ? req.body.youtubeUrl.trim() : "";
    const categoryIdStr = typeof req.body?.categoryId === "string" ? req.body.categoryId.trim() : "";

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

    const maxOrderDocs = await db.read.find({
      req,
      connectionString,
      collection: "videos",
      query: { categoryId },
      sort: { order: -1, createdAt: -1 },
      limit: 1,
    });
    const maxOrder =
      Array.isArray(maxOrderDocs) && maxOrderDocs.length > 0 ? (maxOrderDocs[0] as any)?.order : undefined;
    const order = Number.isFinite(Number(maxOrder)) ? Number(maxOrder) + 1 : 1;

    // Fetch preview (title + thumbnail) to prevent blind uploads
    const preview = await fetchYouTubePreview(youtubeUrl).catch(() => null);
    if (!preview) {
      res.status(400).json({ message: "Invalid YouTube URL or failed to fetch preview" });
      return;
    }

    const youtubeId = preview.youtubeId;

    // Prevent duplicates (same youtubeId)
    const existing = await db.read.findOne({
      req,
      connectionString,
      collection: "videos",
      query: { youtubeId },
    });
    if (existing?._id) {
      res.status(409).json({ message: "Video already added" });
      return;
    }

    const isPublished = req.body?.isPublished === false ? false : true;
    const isFeatured = req.body?.isFeatured === true;

    const now = new Date();
    const payload = {
      title: preview.title,
      description: description || undefined,
      provider: "youtube",
      youtubeId,
      youtubeUrl,
      thumbnailUrl: preview.thumbnailUrl,
      categoryId,
      isPublished,
      isFeatured,
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

    res.status(201).json({
      message: "Video created",
      data: {
        _id: result.insertedId.toString(),
        ...payload,
        categoryId: payload.categoryId.toString(),
      },
    });
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
      const preview = await fetchYouTubePreview(url).catch(() => null);
      if (!preview) {
        res.status(400).json({ message: "Invalid YouTube URL or failed to fetch preview" });
        return;
      }

      updates.youtubeUrl = url;
      updates.youtubeId = preview.youtubeId;
      updates.title = preview.title;
      updates.thumbnailUrl = preview.thumbnailUrl;
      updates.provider = "youtube";

      // Prevent duplicates (same youtubeId) when updating URL
      const duplicate = await db.read.findOne({
        req,
        connectionString,
        collection: "videos",
        query: { youtubeId: preview.youtubeId },
      });
      if (duplicate?._id && existing?._id && duplicate._id.toString() !== existing._id.toString()) {
        res.status(409).json({ message: "Video already added" });
        return;
      }
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
    if (typeof req.body?.isFeatured === "boolean") {
      updates.isFeatured = req.body.isFeatured;
    }
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
    res.status(200).json({
      message: "Video updated",
      data: updated
        ? {
            ...(updated as any),
            _id: (updated as any)._id?.toString?.() ?? (updated as any)._id,
            categoryId: (updated as any).categoryId?.toString?.() ?? (updated as any).categoryId,
          }
        : updated,
    });
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
    const categoryIdParam = typeof req.body?.categoryId === "string" ? req.body.categoryId.trim() : "";

    if (!items || items.length === 0) {
      res.status(200).json({ message: "No changes" });
      return;
    }

    let categoryId: ObjectId | null = null;
    if (categoryIdParam) {
      // Be tolerant: categoryId is optional for reordering, we can reorder purely by video _id.
      if (isObjectIdLike(categoryIdParam)) categoryId = new ObjectId(categoryIdParam);
    }

    const now = new Date();
    // Apply sequential order based on array position
    for (let i = 0; i < items.length; i++) {
      const id = typeof items[i]?.id === "string" ? items[i].id.trim() : "";
      if (!id || !isObjectIdLike(id)) continue;
      const _id = new ObjectId(id);
      const query: Record<string, unknown> = { _id };
      if (categoryId) query.categoryId = categoryId;

      await db.update.updateOne({
        req,
        connectionString,
        collection: "videos",
        query,
        update: { $set: { order: i + 1, updatedAt: now } },
      });
    }

    res.status(200).json({ message: "Videos reordered" });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

