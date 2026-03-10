/**
 * Videos routes – list (public), create (admin/staff only).
 */
import { Router } from "express";
import { auth } from "../../services";
import * as videosController from "../../controllers/videos";

const router = Router();

router.get("/", videosController.listVideosHandler);
router.post(
  "/",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin", "staff"),
  videosController.createVideoHandler
);

export const videosRoutes = router;
