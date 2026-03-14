/**
 * Auth routes – signin, me.
 * RBAC: GET /me requires authentication (Bearer Firebase token).
 */
import { Router } from "express";
import { auth } from "../../services";
import * as authController from "../../controllers/auth";

const router = Router();

router.post("/signin", authController.signinHandler);
router.get("/me", auth.authentication.authenticate, authController.getMeHandler);

router.post("/login-phone", authController.phoneLoginHandler);
router.post("/phone/login", authController.phoneLoginHandler);
router.post(
  "/phone/set-password",
  auth.authentication.authenticate,
  authController.setPhonePasswordHandler
);
router.patch(
  "/reset-password-phone",
  auth.authentication.authenticate,
  authController.resetPasswordPhoneHandler
);

export const authRoutes = router;
