import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { registerHandler, signinHandler } from "./auth.controller";

const authRouter = Router();

authRouter.post("/register", registerHandler);
authRouter.post("/signin", signinHandler);

authRouter.get("/me", authenticate, (req, res) => {
  res.status(200).json({
    message: "Authenticated user profile",
    data: req.user,
  });
});

export { authRouter };
