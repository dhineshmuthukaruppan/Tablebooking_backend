import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/rbac.middleware";

const videosRouter = Router();

videosRouter.get("/", (_req, res) => {
  res.status(200).json({
    message: "Public videos listing scaffold is ready",
    data: [],
  });
});

videosRouter.post("/", authenticate, requireRoles("admin", "staff"), (_req, res) => {
  res.status(201).json({
    message: "Admin video CMS scaffold endpoint",
  });
});

export { videosRouter };
