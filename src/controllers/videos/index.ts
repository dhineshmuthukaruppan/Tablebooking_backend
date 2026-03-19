import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import db from "../../databaseUtilities";

function isObjectIdLike(v: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(v);
}

export async function listVideosHandler(req: Request, res: Response): Promise<void> {
  try {
    const connectionString = db.constants.connectionStrings.tableBooking;
    const categoryParam = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const featuredParam = typeof req.query.featured === "string" ? req.query.featured.trim() : "";
    const pageParam = typeof req.query.page === "string" ? req.query.page.trim() : "";
    const limitParam = typeof req.query.limit === "string" ? req.query.limit.trim() : "";

    const featuredOnly = featuredParam.toLowerCase() === "true" || featuredParam === "1";
    const page = Math.max(1, Number(pageParam || 1) || 1);
    const limit = Math.min(50, Math.max(1, Number(limitParam || 24) || 24));
    const skip = (page - 1) * limit;

    let categoryId: ObjectId | null = null;
    if (categoryParam) {
      if (isObjectIdLike(categoryParam)) {
        categoryId = new ObjectId(categoryParam);
      } else {
        const category = await db.read.findOne({
          req,
          connectionString,
          collection: "video_categories",
          query: { slug: categoryParam },
        });
        if (category?._id) categoryId = category._id as ObjectId;
      }
    }

    const query: Record<string, unknown> = {
      isPublished: { $ne: false }, // public is published-only
    };
    if (categoryId) query.categoryId = categoryId;
    if (featuredOnly) query.isFeatured = true;

    const sort = featuredOnly
      ? { featuredOrder: 1, order: 1, createdAt: -1 }
      : { order: 1, createdAt: -1 };

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

    const categoryMap = new Map<string, { _id: string; name?: string; slug?: string }>();
    for (const c of categories ?? []) {
      const id = (c as { _id?: ObjectId })._id;
      if (id) categoryMap.set(id.toString(), { _id: id.toString(), name: (c as any).name, slug: (c as any).slug });
    }

    const data = (list ?? []).map((v) => {
      const catId = (v as any).categoryId instanceof ObjectId ? (v as any).categoryId.toString() : null;
      return {
        _id: (v as any)._id,
        title: (v as any).title,
        description: (v as any).description,
        provider: (v as any).provider,
        youtubeId: (v as any).youtubeId,
        youtubeUrl: (v as any).youtubeUrl,
        thumbnailUrl: (v as any).thumbnailUrl,
        isFeatured: Boolean((v as any).isFeatured),
        featuredOrder: (v as any).featuredOrder ?? null,
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

// Keeping existing route as a stub for now; admin CMS will use /api/v1/admin/videos.
export function createVideoHandler(_req: Request, res: Response): void {
  res.status(501).json({ message: "Use /api/v1/admin/videos" });
}
