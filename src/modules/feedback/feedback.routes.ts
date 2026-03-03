import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";

const feedbackRouter = Router();

feedbackRouter.get("/", (_req, res) => {
  res.status(200).json({
    message: "Feedback and gallery listing scaffold is ready",
    data: [],
  });
});

feedbackRouter.post("/", authenticate, (_req, res) => {
  res.status(201).json({
    message: "Feedback submission scaffold endpoint",
  });
});

export { feedbackRouter };
