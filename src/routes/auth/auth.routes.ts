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

export const authRoutes = router;
