import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler } from "./middlewares/error.middleware";
import { notFoundHandler } from "./middlewares/not-found.middleware";
import { apiRouter } from "./routes/api.routes";

const app = express();

// CORS: allow frontend origin so browser preflight (OPTIONS) and actual requests succeed
// CORS_ORIGIN can be a comma-separated list of exact origins, e.g.:
// "https://tablebooking-ui-dev-....run.app,http://localhost:3000"
const allowedOrigins = new Set(
  env.CORS_ORIGIN.split(",")
    .map((o) => o.trim())
    .filter(Boolean)
);
if (allowedOrigins.size === 0) {
  allowedOrigins.add("http://localhost:3000");
}

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow non-browser / same-origin requests
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  })
);
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Version-agnostic health (optional). Versioned health: GET /api/v1/health
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "table-booking-backend",
    time: new Date().toISOString(),
  });
});

app.use("/api", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
