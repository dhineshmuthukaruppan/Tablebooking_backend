/**
 * Authentication service – Firebase JWT verification and user attachment.
 * Use as middleware: services.auth.authentication.authenticate
 */
import { authenticate as authenticateMiddleware } from "../../middlewares/auth.middleware";

export const authenticate = authenticateMiddleware;
