import { Router } from "express";
import { auth } from "../../services";
import * as photosController from "../../controllers/photos";
import * as categoriesController from "../../controllers/photos/categories";

const router = Router();

// Photo categories (public list, admin create/update)
router.get("/categories", categoriesController.listPhotoCategoriesHandler);
router.post(
  "/categories",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin"),
  categoriesController.createPhotoCategoryHandler
);
router.patch(
  "/categories/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin"),
  categoriesController.updatePhotoCategoryHandler
);

router.get("/", photosController.listPhotosHandler);
router.get("/serve", photosController.servePhotoHandler);

router.post(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  photosController.uploadPhotoHandler
);

router.post(
  "/complete",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  photosController.completePhotoUploadHandler
);

router.post(
  "/user-upload",
  auth.authentication.authenticate,
  photosController.userUploadPhotoHandler
);

router.post(
  "/user-upload/complete",
  auth.authentication.authenticate,
  photosController.completeUserPhotoUploadHandler
);

router.get(
  "/admin",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin"),
  photosController.listUserImagesHandler
);

router.patch(
  "/admin/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin"),
  photosController.approveUserImageHandler
);

export { router as photosRoutes };

