/**
 * Feedback routes – list (public), submit (authenticated).
 */
import { Router } from "express";
import multer from "multer";
import { auth } from "../../services";
import * as feedbackController from "../../controllers/feedback";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Public list of feedback already filtered by isPublicVisible === true
router.get("/", feedbackController.listFeedbackHandler);
router.get("/by-booking", auth.authentication.authenticate, feedbackController.getFeedbackByBookingIdHandler);
router.post("/", auth.authentication.authenticate, feedbackController.submitFeedbackHandler);

// Upload / delete feedback images (used by feedback form)
router.post(
  "/images",
  auth.authentication.authenticate,
  upload.single("image"),
  feedbackController.uploadFeedbackImageHandler
);

router.delete(
  "/images",
  auth.authentication.authenticate,
  feedbackController.deleteFeedbackImageHandler
);

export const feedbackRoutes = router;
