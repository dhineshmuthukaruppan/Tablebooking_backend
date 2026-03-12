import { Router } from "express";
import * as menuController from "../../controllers/menu";

const router = Router();

router.get("/categories", menuController.listCategoriesHandler);
router.get("/categories/id/:categoryId", menuController.getCategoryByIdHandler);
router.get("/categories/:categorySlug", menuController.getCategoryBySlugHandler);
router.get("/product/:productSlug", menuController.getProductBySlugHandler);

export const menuRoutes = router;
