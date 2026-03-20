import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import db from "../../databaseUtilities";
import { uploadMenuImage, deleteFile } from "../../config/gcs";

const CONN = db.constants.connectionStrings.tableBooking;

function getBodyString(req: Request, key: string): string | undefined {
  const v = (req.body as Record<string, unknown>)[key];
  return typeof v === "string" ? v.trim() || undefined : undefined;
}

function getBodyNumber(req: Request, key: string): number | undefined {
  const v = (req.body as Record<string, unknown>)[key];
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

function getBodyBool(req: Request, key: string): boolean | undefined {
  const v = (req.body as Record<string, unknown>)[key];
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return undefined;
}

/** GET /admin/menu/categories */
export async function getAdminCategoriesHandler(req: Request, res: Response): Promise<void> {
  try {
    const list = await db.read.find({
      req,
      connectionString: CONN,
      collection: "menu_categories",
      query: {},
      sort: { order: 1 },
    });
    res.status(200).json({ data: list });
  } catch (err) {
    console.error("[admin/menu] getAdminCategoriesHandler error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

/** POST /admin/menu/categories – multipart: name, slug, order, isActive, optional coverImage file */
export async function postAdminCategoryHandler(req: Request, res: Response): Promise<void> {
  try {
    const name = getBodyString(req, "name");
    const slug = getBodyString(req, "slug");
    const orderVal = getBodyNumber(req, "order");
    const isActive = getBodyBool(req, "isActive") ?? true;

    if (!name || !slug) {
      res.status(400).json({ message: "name and slug are required" });
      return;
    }

    // New flow: signed-url upload stores the GCS objectName in req.body.coverImage.
    // Backward compatible: if a file is present, fall back to server-side upload.
    let coverImage: string | undefined = getBodyString(req, "coverImage");
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!coverImage && file?.buffer) {
      const result = await uploadMenuImage({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        folder: "categories",
      });
      coverImage = result.objectName;
    }

    const payload = {
      name,
      slug,
      coverImage: coverImage ?? null,
      order: typeof orderVal === "number" ? orderVal : 0,
      isActive,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const insertResult = await db.create.insertOne({
      req,
      connectionString: CONN,
      collection: "menu_categories",
      payload,
    });

    res.status(201).json({
      message: "Category created",
      data: { _id: insertResult.insertedId?.toString(), ...payload },
    });
  } catch (err) {
    console.error("[admin/menu] postAdminCategoryHandler error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

/** PATCH /admin/menu/categories/:id */
export async function patchAdminCategoryHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0];
    if (!id || !ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid category id" });
      return;
    }

    const name = getBodyString(req, "name");
    const slug = getBodyString(req, "slug");
    const orderVal = getBodyNumber(req, "order");
    const isActive = getBodyBool(req, "isActive");
    const clearCoverImage = getBodyBool(req, "clearCoverImage") === true;

    const file = (req as unknown as { file?: Express.Multer.File }).file;
    let coverImage: string | undefined = getBodyString(req, "coverImage");
    if (!coverImage && file?.buffer) {
      const result = await uploadMenuImage({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        folder: "categories",
      });
      coverImage = result.objectName;
    }

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) update.name = name;
    if (slug !== undefined) update.slug = slug;
    if (orderVal !== undefined) update.order = orderVal;
    if (isActive !== undefined) update.isActive = isActive;
    if (coverImage !== undefined) update.coverImage = coverImage;
    if (clearCoverImage) {
      const existing = (await db.read.findOne({
        req,
        connectionString: CONN,
        collection: "menu_categories",
        query: { _id: new ObjectId(id) },
      })) as { coverImage?: string | null } | null;
      if (existing?.coverImage && typeof existing.coverImage === "string") {
        await deleteFile(existing.coverImage);
      }
      if (coverImage === undefined) update.coverImage = null;
    }

    if (Object.keys(update).length <= 1) {
      res.status(400).json({ message: "No valid fields to update" });
      return;
    }

    await db.update.updateOne({
      req,
      connectionString: CONN,
      collection: "menu_categories",
      query: { _id: new ObjectId(id) },
      update: { $set: update },
    });

    res.status(200).json({ message: "Category updated" });
  } catch (err) {
    console.error("[admin/menu] patchAdminCategoryHandler error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

/** GET /admin/menu/products – optional query categoryId */
export async function getAdminProductsHandler(req: Request, res: Response): Promise<void> {
  try {
    const categoryId = req.query.categoryId as string | undefined;
    const query: Record<string, unknown> = {};
    if (categoryId && ObjectId.isValid(categoryId)) {
      query.categoryId = new ObjectId(categoryId);
    }

    const list = await db.read.find({
      req,
      connectionString: CONN,
      collection: "menu_products",
      query,
      sort: { name: 1 },
    });
    res.status(200).json({ data: list });
  } catch (err) {
    console.error("[admin/menu] getAdminProductsHandler error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

/** POST /admin/menu/products – multipart: name, slug, categoryId, price, currency, description, tags, isAvailable, optional image file */
export async function postAdminProductHandler(req: Request, res: Response): Promise<void> {
  try {
    const name = getBodyString(req, "name");
    const slug = getBodyString(req, "slug");
    const categoryIdStr = getBodyString(req, "categoryId");
    const priceVal = getBodyNumber(req, "price");
    const currency = getBodyString(req, "currency");
    const description = getBodyString(req, "description");
    const isAvailable = getBodyBool(req, "isAvailable") ?? true;

    if (!name || !slug || !categoryIdStr || !ObjectId.isValid(categoryIdStr)) {
      res.status(400).json({ message: "name, slug, and valid categoryId are required" });
      return;
    }

    const price = typeof priceVal === "number" ? priceVal : 0;
    const currencyStr = currency ?? "AED";

    let tags: string[] = [];
    const tagsRaw = (req.body as Record<string, unknown>).tags;
    if (Array.isArray(tagsRaw)) {
      tags = tagsRaw.filter((t): t is string => typeof t === "string");
    } else if (typeof tagsRaw === "string") {
      tags = tagsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    }

    // New flow: signed-url upload stores the GCS objectName in req.body.image.
    // Backward compatible: if a file is present, fall back to server-side upload.
    let image: string | undefined = getBodyString(req, "image");
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!image && file?.buffer) {
      const result = await uploadMenuImage({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        folder: "products",
      });
      image = result.objectName;
    }

    const payload = {
      name,
      slug,
      categoryId: new ObjectId(categoryIdStr),
      price,
      currency: currencyStr,
      image: image ?? null,
      description: description ?? null,
      tags,
      isAvailable,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const insertResult = await db.create.insertOne({
      req,
      connectionString: CONN,
      collection: "menu_products",
      payload,
    });

    res.status(201).json({
      message: "Product created",
      data: { _id: insertResult.insertedId?.toString(), ...payload },
    });
  } catch (err) {
    console.error("[admin/menu] postAdminProductHandler error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

/** PATCH /admin/menu/products/:id */
export async function patchAdminProductHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0];
    if (!id || !ObjectId.isValid(id)) {
      res.status(400).json({ message: "Invalid product id" });
      return;
    }

    const name = getBodyString(req, "name");
    const slug = getBodyString(req, "slug");
    const categoryIdStr = getBodyString(req, "categoryId");
    const priceVal = getBodyNumber(req, "price");
    const currency = getBodyString(req, "currency");
    const description = getBodyString(req, "description");
    const isAvailable = getBodyBool(req, "isAvailable");
    const clearImage = getBodyBool(req, "clearImage") === true;

    let tags: string[] | undefined;
    const tagsRaw = (req.body as Record<string, unknown>).tags;
    if (Array.isArray(tagsRaw)) {
      tags = tagsRaw.filter((t): t is string => typeof t === "string");
    } else if (typeof tagsRaw === "string") {
      tags = tagsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    }

    const file = (req as unknown as { file?: Express.Multer.File }).file;
    let image: string | undefined = getBodyString(req, "image");
    if (!image && file?.buffer) {
      const result = await uploadMenuImage({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        folder: "products",
      });
      image = result.objectName;
    }

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) update.name = name;
    if (slug !== undefined) update.slug = slug;
    if (categoryIdStr !== undefined && ObjectId.isValid(categoryIdStr)) update.categoryId = new ObjectId(categoryIdStr);
    if (priceVal !== undefined) update.price = priceVal;
    if (currency !== undefined) update.currency = currency;
    if (description !== undefined) update.description = description;
    if (isAvailable !== undefined) update.isAvailable = isAvailable;
    if (tags !== undefined) update.tags = tags;
    if (image !== undefined) update.image = image;
    if (clearImage) {
      const existing = (await db.read.findOne({
        req,
        connectionString: CONN,
        collection: "menu_products",
        query: { _id: new ObjectId(id) },
      })) as { image?: string | null } | null;
      if (existing?.image && typeof existing.image === "string") {
        await deleteFile(existing.image);
      }
      if (image === undefined) update.image = null;
    }

    if (Object.keys(update).length <= 1) {
      res.status(400).json({ message: "No valid fields to update" });
      return;
    }

    await db.update.updateOne({
      req,
      connectionString: CONN,
      collection: "menu_products",
      query: { _id: new ObjectId(id) },
      update: { $set: update },
    });

    res.status(200).json({ message: "Product updated" });
  } catch (err) {
    console.error("[admin/menu] patchAdminProductHandler error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}
