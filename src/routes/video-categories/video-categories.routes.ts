/**
 * Video categories routes – list (public).
 */
import { Router } from "express";
import * as videoCategoriesController from "../../controllers/videoCategories";

const router = Router();

router.get("/", videoCategoriesController.listVideoCategoriesHandler);

export const videoCategoriesRoutes = router;

