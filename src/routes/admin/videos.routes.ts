/**
 * Admin video CMS routes (admin/staff).
 */
import { Router } from "express";
import { auth } from "../../services";
import * as adminVideosController from "../../controllers/admin/videos";

const router = Router();

// Categories
router.get(
  "/video-categories",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminVideosController.adminListVideoCategoriesHandler
);
router.post(
  "/video-categories",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminVideosController.adminCreateVideoCategoryHandler
);
router.patch(
  "/video-categories/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminVideosController.adminPatchVideoCategoryHandler
);
router.delete(
  "/video-categories/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminVideosController.adminDeleteVideoCategoryHandler
);
router.patch(
  "/video-categories/reorder",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminVideosController.adminReorderVideoCategoriesHandler
);

// Videos
router.get(
  "/videos",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminVideosController.adminListVideosHandler
);
router.post(
  "/videos",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminVideosController.adminCreateVideoHandler
);
router.patch(
  "/videos/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminVideosController.adminPatchVideoHandler
);
router.delete(
  "/videos/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminVideosController.adminDeleteVideoHandler
);
router.patch(
  "/videos/reorder",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminVideosController.adminReorderVideosHandler
);

export const adminVideosRoutes = router;

