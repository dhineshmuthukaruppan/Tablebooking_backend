import { Router } from "express";
import multer from "multer";
import { auth } from "../../services";
import * as menuController from "../../controllers/admin/menu.handler";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const authAdminStaff = [auth.authentication.authenticate, auth.privilege.requireRoles("admin", "staff")];

router.get("/categories", ...authAdminStaff, menuController.getAdminCategoriesHandler);
router.post(
  "/categories",
  ...authAdminStaff,
  upload.single("coverImage"),
  menuController.postAdminCategoryHandler
);
router.patch(
  "/categories/:id",
  ...authAdminStaff,
  upload.single("coverImage"),
  menuController.patchAdminCategoryHandler
);

router.get("/products", ...authAdminStaff, menuController.getAdminProductsHandler);
router.post(
  "/products",
  ...authAdminStaff,
  upload.single("image"),
  menuController.postAdminProductHandler
);
router.patch(
  "/products/:id",
  ...authAdminStaff,
  upload.single("image"),
  menuController.patchAdminProductHandler
);

export const menuAdminRoutes = router;
