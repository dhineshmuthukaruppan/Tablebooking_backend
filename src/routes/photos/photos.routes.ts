import { Router } from "express";
import { auth } from "../../services";
import * as photosController from "../../controllers/photos";

const router = Router();

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

router.delete(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  photosController.deletePhotoHandler
);

export const photosRoutes = router;

