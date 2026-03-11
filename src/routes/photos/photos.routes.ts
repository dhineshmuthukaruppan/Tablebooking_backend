import { Router } from "express";
import multer from "multer";
import { auth } from "../../services";
import * as photosController from "../../controllers/photos";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/", photosController.listPhotosHandler);
router.get("/serve", photosController.servePhotoHandler);

router.post(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  upload.single("image"),
  photosController.uploadPhotoHandler
);

router.delete(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  photosController.deletePhotoHandler
);

export const photosRoutes = router;

