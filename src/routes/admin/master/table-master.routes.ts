/**
 * Table master config. Base path: /admin/master/table-master
 */
import { Router } from "express";
import { auth } from "../../../services";
import * as masterController from "../../../controllers/admin/master";

const router = Router();

// Match both "" and "/" (Express can pass either to a mounted router)
const rootPaths = ["/", ""] as const;

rootPaths.forEach((path) => {
  router.get(
    path,
    auth.authentication.authenticate,
    auth.privilege.requireRoles("admin", "staff"),
    masterController.getTableMasterConfigHandler
  );
  router.put(
    path,
    auth.authentication.authenticate,
    auth.privilege.requireRoles("admin", "staff"),
    masterController.putTableMasterConfigHandler
  );
});

export const tableMasterRoutes = router;
