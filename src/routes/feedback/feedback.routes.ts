/**
 * Feedback routes – list (public), submit (authenticated).
 */
import { Router } from "express";
import { auth } from "../../services";
import * as feedbackController from "../../controllers/feedback";

const router = Router();

router.get("/", feedbackController.listFeedbackHandler);
router.post("/", auth.authentication.authenticate, feedbackController.submitFeedbackHandler);

export const feedbackRoutes = router;
