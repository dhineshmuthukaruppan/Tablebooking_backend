import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";

const authRouter = Router();

authRouter.get("/me", authenticate, (req, res) => {
  res.status(200).json({
    message: "Authenticated user profile",
    data: req.user,
  });
});

export { authRouter };
