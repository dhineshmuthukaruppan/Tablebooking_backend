/**
 * Bookings routes.
 * RBAC: GET / requires authentication.
 */
import { Router } from "express";
import { auth } from "../../services";
import * as bookingsController from "../../controllers/bookings";

const router = Router();

router.get("/", auth.authentication.authenticate, bookingsController.listBookingsHandler);

export const bookingsRoutes = router;
