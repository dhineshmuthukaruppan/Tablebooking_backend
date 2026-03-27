/**
 * Feedback routes – list (public), submit (authenticated).
 */
import { Router } from "express";
import { auth } from "../../services";
import * as feedbackController from "../../controllers/feedback";

const router = Router();

// Public list of feedback already filtered by isPublicVisible === true
router.get("/", feedbackController.listFeedbackHandler);
router.get("/by-booking", auth.authentication.authenticate, feedbackController.getFeedbackByBookingIdHandler);
router.post("/", auth.authentication.authenticate, feedbackController.submitFeedbackHandler);

// Upload / delete feedback images (used by feedback form)
router.post(
  "/images",
  auth.authentication.authenticate,
  feedbackController.uploadFeedbackImageHandler
);

router.delete(
  "/images",
  auth.authentication.authenticate,
  feedbackController.deleteFeedbackImageHandler
);

export const feedbackRoutes = router;
