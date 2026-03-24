import type { Request, Response } from "express";
import db from "../../databaseUtilities";
import { ObjectId } from "mongodb";

const TABLE_BOOKING_CONN = db.constants.connectionStrings.tableBooking;
const COLLECTION = "photo_categories";

export interface PhotoCategoryDoc {
  _id: ObjectId;
  name: string;
  slug: string;
  allowedFor: string[]; // "owner" | "staff" | "user"
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** GET /photos/categories — public. Pass ?includeDisabled=true to include disabled ones. */
export async function listPhotoCategoriesHandler(req: Request, res: Response): Promise<void> {
  try {
    const includeDisabled = req.query.includeDisabled === "true";
    const query: Record<string, unknown> = includeDisabled ? {} : { enabled: true };

    const categories = await db.read.find({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: COLLECTION,
      query,
      sort: { createdAt: 1 },
    });

    res.status(200).json({ data: categories ?? [] });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[photo_categories] listPhotoCategoriesHandler error", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

/** POST /photos/categories — admin only. */
export async function createPhotoCategoryHandler(req: Request, res: Response): Promise<void> {
  try {
    const { name, allowedFor, enabled } = req.body as {
      name?: string;
      allowedFor?: string[];
      enabled?: boolean;
    };

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ message: "name is required" });
      return;
    }

    const slug = toSlug(name);

    const existing = await db.read.findOne({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: COLLECTION,
      query: { slug },
    });

    if (existing) {
      res.status(409).json({ message: "A category with this name already exists" });
      return;
    }

    const _id = new ObjectId();
    const payload: PhotoCategoryDoc & Record<string, unknown> = {
      _id,
      name: name.trim(),
      slug,
      allowedFor: Array.isArray(allowedFor) ? allowedFor : ["owner", "staff", "user"],
      enabled: enabled !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.create.insertOne({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: COLLECTION,
      payload,
    });

    res.status(201).json({ message: "Category created", data: payload });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[photo_categories] createPhotoCategoryHandler error", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

/** PATCH /photos/categories/:id — admin only. */
export async function updatePhotoCategoryHandler(req: Request, res: Response): Promise<void> {
  try {
    let id: ObjectId;
    try {
      id = new ObjectId(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    } catch {
      res.status(400).json({ message: "Invalid category id" });
      return;
    }

    const { name, allowedFor, enabled } = req.body as {
      name?: string;
      allowedFor?: string[];
      enabled?: boolean;
    };

    const setFields: Record<string, unknown> = { updatedAt: new Date() };

    if (name && typeof name === "string" && name.trim()) {
      const newSlug = toSlug(name);
      // Check slug collision (exclude current doc)
      const collision = await db.read.findOne({
        req,
        connectionString: TABLE_BOOKING_CONN,
        collection: COLLECTION,
        query: { slug: newSlug, _id: { $ne: id } },
      });
      if (collision) {
        res.status(409).json({ message: "A category with this name already exists" });
        return;
      }
      setFields.name = name.trim();
      setFields.slug = newSlug;
    }

    if (Array.isArray(allowedFor)) setFields.allowedFor = allowedFor;
    if (typeof enabled === "boolean") setFields.enabled = enabled;

    await db.update.updateOne({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: COLLECTION,
      query: { _id: id },
      update: { $set: setFields },
    });

    const updated = await db.read.findOne({
      req,
      connectionString: TABLE_BOOKING_CONN,
      collection: COLLECTION,
      query: { _id: id },
    });

    res.status(200).json({ message: "Category updated", data: updated });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[photo_categories] updatePhotoCategoryHandler error", error);
    res.status(500).json({ message: "Internal server error" });
  }
}
