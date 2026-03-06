/**
 * User registration routes – signup/register.
 */
import { Router } from "express";
import * as userRegistrationController from "../../controllers/user_registration";

const router = Router();

router.post("/register", userRegistrationController.registerHandler);

export const userRegistrationRoutes = router;
