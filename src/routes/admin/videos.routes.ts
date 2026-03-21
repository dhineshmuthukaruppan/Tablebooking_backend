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
// Static path before :id — otherwise "reorder" is captured as an id
router.patch(
  "/video-categories/reorder",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminVideosController.adminReorderVideoCategoriesHandler
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
// Static path before :id — otherwise "reorder" is captured as an id (400 Invalid id)
router.patch(
  "/videos/reorder",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  adminVideosController.adminReorderVideosHandler
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

export const adminVideosRoutes = router;

