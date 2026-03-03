import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";

const bookingsRouter = Router();

bookingsRouter.get("/", authenticate, (_req, res) => {
  res.status(200).json({
    message: "Bookings module scaffold is ready",
    data: [],
  });
});

export { bookingsRouter };
