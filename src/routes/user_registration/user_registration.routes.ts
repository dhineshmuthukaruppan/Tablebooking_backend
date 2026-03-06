/**
 * User registration routes – signup/register.
 * Token in Authorization header; authenticate middleware verifies and attaches user.
 */
import { Router } from "express";
import { auth } from "../../services";
import * as userRegistrationController from "../../controllers/user_registration";

const router = Router();

router.post(
  "/register",
  userRegistrationController.registerHandler
);

export const userRegistrationRoutes = router;
