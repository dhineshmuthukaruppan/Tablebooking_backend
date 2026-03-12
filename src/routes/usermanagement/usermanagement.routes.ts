/**
 * User management routes – list all users, add user.
 * RBAC: admin only.
 */
import { Router } from "express";
import { auth } from "../../services";
import * as usermanagementController from "../../controllers/usermanagement";

const router = Router();

router.get(
  "/users",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin"),
  usermanagementController.getUsersHandler
);

router.post(
  "/users/list",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin"),
  usermanagementController.listUsersPostHandler
);

router.post(
  "/users",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin"),
  usermanagementController.addUserHandler
);

router.patch(
  "/users/:id",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin"),
  usermanagementController.updateUserHandler
);

router.patch(
  "/users/:id/status",
  auth.authentication.authenticate,
  auth.privilege.requireRoles("admin"),
  usermanagementController.setUserStatusHandler
);

export const usermanagementRoutes = router;
