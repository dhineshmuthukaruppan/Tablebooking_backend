/**
 * Bookings routes.
 * GET / and GET /config require authentication.
 */
import { Router } from "express";
import { auth } from "../../services";
import * as bookingsController from "../../controllers/bookings";

const router = Router();

router.get("/", auth.authentication.authenticate, bookingsController.listBookingsHandler);
router.post("/", auth.authentication.authenticate, bookingsController.createBookingHandler);
router.get("/config", auth.authentication.authenticate, bookingsController.getBookingConfigHandler);

export const bookingsRoutes = router;
