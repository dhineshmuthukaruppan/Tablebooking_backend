import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import db from "../../databaseUtilities";
import { fetchYouTubePreview } from "../../lib/videos/oembed";

function isObjectIdLike(v: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(v);
}

export async function listVideosHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const categoryIdParamRaw = typeof req.query.categoryId === "string" ? req.query.categoryId.trim() : "";
    const categoryParamRaw = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const categoryIdParam = categoryIdParamRaw || (isObjectIdLike(categoryParamRaw) ? categoryParamRaw : "");
    const featuredParam = typeof req.query.featured === "string" ? req.query.featured.trim() : "";
    const pageParam = typeof req.query.page === "string" ? req.query.page.trim() : "";
    const limitParam = typeof req.query.limit === "string" ? req.query.limit.trim() : "";

    const featuredProvided = featuredParam !== "";
    const featuredValue = featuredProvided ? featuredParam.toLowerCase() === "true" || featuredParam === "1" : null;
    const page = Math.max(1, Number(pageParam || 1) || 1);
    const limit = Math.min(50, Math.max(1, Number(limitParam || 24) || 24));
    const skip = (page - 1) * limit;

    let categoryId: ObjectId | null = null;
    if (categoryIdParam) {
      categoryId = new ObjectId(categoryIdParam);
    }

    const query: Record<string, unknown> = {
      isPublished: { $ne: false }, // public is published-only
    };
    if (categoryId) query.categoryId = categoryId;
    if (featuredValue !== null) query.isFeatured = featuredValue;

    const sort = { order: 1, createdAt: -1 };

    const [list, total] = await Promise.all([
      db.read.find({
        req,
        connectionString,
        collection: "videos",
        query,
        sort,
        skip,
        limit,
      }),
      db.read.count({
        req,
        connectionString,
        collection: "videos",
        query,
      }),
    ]);

    const categoryIds = Array.from(
      new Set(
        (list ?? [])
          .map((v) => (v as { categoryId?: unknown }).categoryId)
          .filter((id): id is ObjectId => id instanceof ObjectId)
          .map((id) => id.toString())
      )
    ).map((id) => new ObjectId(id));

    const categories = categoryIds.length
      ? await db.read.find({
          req,
          connectionString,
          collection: "video_categories",
          query: { _id: { $in: categoryIds } },
        })
      : [];

    const categoryMap = new Map<string, { _id: string; name?: string }>();
    for (const c of categories ?? []) {
      const id = (c as { _id?: ObjectId })._id;
      if (id) categoryMap.set(id.toString(), { _id: id.toString(), name: (c as any).name });
    }

    const data = (list ?? []).map((v) => {
      const catId = (v as any).categoryId instanceof ObjectId ? (v as any).categoryId.toString() : null;
      return {
        _id: (v as any)._id,
        title: (v as any).title,
        description: (v as any).description,
        provider: (v as any).provider,
        youtubeId: (v as any).youtubeId,
        thumbnailUrl: (v as any).thumbnailUrl,
        isFeatured: Boolean((v as any).isFeatured),
        order: typeof (v as any).order === "number" ? (v as any).order : null,
        category: catId ? categoryMap.get(catId) ?? null : null,
      };
    });

    res.status(200).json({
      message: "Videos",
      data,
      total,
      page,
      limit,
    });
  } catch {
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function previewVideoHandler(req: Request, res: Response): Promise<void> {
  try {
    const url = typeof req.query.url === "string" ? req.query.url.trim() : "";
    if (!url) {
      res.status(400).json({ message: "Missing url" });
      return;
    }

    const preview = await fetchYouTubePreview(url);
    res.status(200).json({ message: "Video preview", data: preview });
  } catch (e) {
    res.status(400).json({ message: "Invalid YouTube URL or failed to fetch preview" });
  }
}

// Keeping existing route as a stub for now; admin CMS will use /api/v1/admin/videos.
export function createVideoHandler(_req: Request, res: Response): void {
  res.status(501).json({ message: "Use /api/v1/admin/videos" });
}
