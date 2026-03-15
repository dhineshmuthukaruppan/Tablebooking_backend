/**
 * Bookings routes.
 * Booking actions require authentication, but config is public for the landing page.
 */
import { Router } from "express";
import { auth } from "../../services";
import * as bookingsController from "../../controllers/bookings";

const router = Router();

router.get("/", auth.authentication.authenticate, bookingsController.listBookingsHandler);
router.get("/feedback-pending", auth.authentication.authenticate, bookingsController.getFeedbackPendingBookingsHandler);
router.get("/config", bookingsController.getBookingConfigHandler);
router.get("/slots", auth.authentication.authenticate, bookingsController.getSlotsHandler);
router.patch("/:id/cancel", auth.authentication.authenticate, bookingsController.cancelBookingHandler);
router.get("/:id", auth.authentication.authenticate, bookingsController.getBookingByIdHandler);
router.post("/", auth.authentication.authenticate, bookingsController.createBookingHandler);

export const bookingsRoutes = router;
