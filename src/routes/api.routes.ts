/**
 * API version aggregator. Mounts versioned routers under /api.
 * All versions live under /api (e.g. /api/v1/health, /api/v2/health).
 * See BACKEND_STRUCTURE_GUIDE.md and config/api-versions.ts.
 */
import { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { getVersionConfig, type ApiVersionId } from "../config/api-versions";
import { v1Router } from "./index";

const apiRouter = Router();

/** Middleware: set X-API-Version and optional Deprecation/Sunset/Link headers */
function versionHeadersMiddleware(version: ApiVersionId) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-API-Version", version);
    const config = getVersionConfig(version);
    if (config?.deprecated) {
      res.setHeader("Deprecation", "true");
      if (config.sunsetDate) res.setHeader("Sunset", config.sunsetDate);
      if (config.linkSuccessor)
        res.setHeader("Link", `</api/${config.linkSuccessor}>; rel="successor"`);
    }
    next();
  };
}

// Mount each supported version. Add v2Router here when needed: apiRouter.use("/v2", versionHeadersMiddleware("v2"), v2Router);
apiRouter.use("/v1", versionHeadersMiddleware("v1"), v1Router);

export { apiRouter };
