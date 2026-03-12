import type { Request, Response } from "express";
import db from "../../databaseUtilities";

const CONN = db.constants.connectionStrings.tableBooking;

type CategoryDoc = {
  _id: import("mongodb").ObjectId;
  name: string;
  slug: string;
  coverImage?: string;
  order: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

type ProductDoc = {
  _id: import("mongodb").ObjectId;
  name: string;
  slug: string;
  categoryId: import("mongodb").ObjectId;
  price: number;
  currency: string;
  image?: string;
  description?: string;
  tags?: string[];
  isAvailable: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

/** GET /menu/categories – list active categories with item count, sorted by order */
export async function listCategoriesHandler(req: Request, res: Response): Promise<void> {
  try {
    const categories = (await db.read.find({
      req,
      connectionString: CONN,
      collection: "menu_categories",
      query: { isActive: true },
      sort: { order: 1 },
    })) as CategoryDoc[];

    const productCounts = (await db.read.find({
      req,
      connectionString: CONN,
      collection: "menu_products",
      query: { isAvailable: true },
      projection: { categoryId: 1 },
    })) as unknown as { categoryId: import("mongodb").ObjectId }[];

    const countByCategoryId: Record<string, number> = {};
    for (const p of productCounts) {
      const id = (p.categoryId as import("mongodb").ObjectId).toString();
      countByCategoryId[id] = (countByCategoryId[id] ?? 0) + 1;
    }

    const data = categories.map((cat) => ({
      _id: cat._id?.toString(),
      name: cat.name,
      slug: cat.slug,
      coverImage: cat.coverImage ?? null,
      order: cat.order,
      itemCount: countByCategoryId[cat._id?.toString() ?? ""] ?? 0,
    }));

    res.status(200).json({ data });
  } catch (err) {
    console.error("[menu] listCategoriesHandler error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

/** GET /menu/categories/id/:categoryId – get category by ID with products (preferred; slug is editable) */
export async function getCategoryByIdHandler(req: Request, res: Response): Promise<void> {
  try {
    const { ObjectId } = await import("mongodb");
    const categoryId = req.params.categoryId as string;
    if (!categoryId || !ObjectId.isValid(categoryId)) {
      res.status(400).json({ message: "Valid category ID is required" });
      return;
    }

    const category = (await db.read.findOne({
      req,
      connectionString: CONN,
      collection: "menu_categories",
      query: { _id: new ObjectId(categoryId), isActive: true },
    })) as CategoryDoc | null;

    if (!category) {
      res.status(404).json({ message: "Category not found" });
      return;
    }

    const products = (await db.read.find({
      req,
      connectionString: CONN,
      collection: "menu_products",
      query: { categoryId: category._id, isAvailable: true },
      sort: { name: 1 },
    })) as ProductDoc[];

    const productsData = products.map((p) => ({
      _id: p._id?.toString(),
      name: p.name,
      slug: p.slug,
      price: p.price,
      currency: p.currency,
      image: p.image ?? null,
      description: p.description ?? null,
      tags: p.tags ?? [],
    }));

    res.status(200).json({
      data: {
        category: {
          _id: category._id?.toString(),
          name: category.name,
          slug: category.slug,
          coverImage: category.coverImage ?? null,
          order: category.order,
        },
        products: productsData,
      },
    });
  } catch (err) {
    console.error("[menu] getCategoryByIdHandler error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

/** GET /menu/categories/:categorySlug – get category by slug with products (Level 2; prefer id route) */
export async function getCategoryBySlugHandler(req: Request, res: Response): Promise<void> {
  try {
    const categorySlug = req.params.categorySlug as string;
    if (!categorySlug) {
      res.status(400).json({ message: "Category slug is required" });
      return;
    }

    const category = (await db.read.findOne({
      req,
      connectionString: CONN,
      collection: "menu_categories",
      query: { slug: categorySlug, isActive: true },
    })) as CategoryDoc | null;

    if (!category) {
      res.status(404).json({ message: "Category not found" });
      return;
    }

    const products = (await db.read.find({
      req,
      connectionString: CONN,
      collection: "menu_products",
      query: { categoryId: category._id, isAvailable: true },
      sort: { name: 1 },
    })) as ProductDoc[];

    const productsData = products.map((p) => ({
      _id: p._id?.toString(),
      name: p.name,
      slug: p.slug,
      price: p.price,
      currency: p.currency,
      image: p.image ?? null,
      description: p.description ?? null,
      tags: p.tags ?? [],
    }));

    res.status(200).json({
      data: {
        category: {
          _id: category._id?.toString(),
          name: category.name,
          slug: category.slug,
          coverImage: category.coverImage ?? null,
          order: category.order,
        },
        products: productsData,
      },
    });
  } catch (err) {
    console.error("[menu] getCategoryBySlugHandler error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}

/** GET /menu/product/:productSlug – get product by slug with category and related products (Level 3) */
export async function getProductBySlugHandler(req: Request, res: Response): Promise<void> {
  try {
    const productSlug = req.params.productSlug as string;
    if (!productSlug) {
      res.status(400).json({ message: "Product slug is required" });
      return;
    }

    const product = (await db.read.findOne({
      req,
      connectionString: CONN,
      collection: "menu_products",
      query: { slug: productSlug, isAvailable: true },
    })) as ProductDoc | null;

    if (!product) {
      res.status(404).json({ message: "Product not found" });
      return;
    }

    const category = (await db.read.findOne({
      req,
      connectionString: CONN,
      collection: "menu_categories",
      query: { _id: product.categoryId, isActive: true },
      projection: { _id: 1, name: 1, slug: 1 },
    })) as { _id: import("mongodb").ObjectId; name: string; slug: string } | null;

    const related = (await db.read.find({
      req,
      connectionString: CONN,
      collection: "menu_products",
      query: {
        categoryId: product.categoryId,
        isAvailable: true,
        _id: { $ne: product._id },
      },
      sort: { name: 1 },
      limit: 6,
    })) as ProductDoc[];

    const relatedData = related.map((p) => ({
      _id: p._id?.toString(),
      name: p.name,
      slug: p.slug,
      price: p.price,
      currency: p.currency,
      image: p.image ?? null,
    }));

    res.status(200).json({
      data: {
        product: {
          _id: product._id?.toString(),
          name: product.name,
          slug: product.slug,
          categoryId: product.categoryId?.toString(),
          price: product.price,
          currency: product.currency,
          image: product.image ?? null,
          description: product.description ?? null,
          tags: product.tags ?? [],
        },
        category: category
          ? { _id: category._id?.toString(), name: category.name, slug: category.slug }
          : null,
        related: relatedData,
      },
    });
  } catch (err) {
    console.error("[menu] getProductBySlugHandler error", err);
    res.status(500).json({ message: "Internal server error" });
  }
}
