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
const TABLE_ALLOCATIONS_POLL_PATH = "/api/v1/admin/table-allocations";
const STRICT_AUTH_RATE_LIMIT_PATHS = new Set([
  "/api/v1/auth/signin",
  "/api/v1/auth/login-phone",
  "/api/v1/auth/phone/login",
  "/api/v1/auth/register",
]);
const RATE_LIMIT_SKIP_PATHS = new Set(["/api/health", "/api/v1/health"]);

function createLimiter(max: number, options?: { skip?: (req: express.Request) => boolean }) {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: options?.skip,
    handler: (_req, res) => {
      res.status(429).json({
        message: "Too many requests. Please try again later.",
      });
    },
  });
}

app.set("trust proxy", 1);

// CORS: allow frontend origin so browser preflight (OPTIONS) and actual requests succeed
const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
if (allowedOrigins.length === 0) allowedOrigins.push("http://localhost:3000", "http://127.0.0.1:3000");

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
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

const generalRateLimiter = createLimiter(env.RATE_LIMIT_MAX_REQUESTS, {
  skip: (req) =>
    RATE_LIMIT_SKIP_PATHS.has(req.path) ||
    (req.method === "POST" && STRICT_AUTH_RATE_LIMIT_PATHS.has(req.path)) ||
    (req.method === "GET" && req.path === TABLE_ALLOCATIONS_POLL_PATH),
});

const tableAllocationsPollRateLimiter = createLimiter(env.RATE_LIMIT_TABLE_ALLOCATIONS_GET_MAX_REQUESTS, {
  skip: (req) => RATE_LIMIT_SKIP_PATHS.has(req.path),
});

const strictAuthRateLimiter = createLimiter(env.RATE_LIMIT_AUTH_MAX_REQUESTS, {
  skip: (req) => RATE_LIMIT_SKIP_PATHS.has(req.path),
});

app.use(generalRateLimiter);
app.use((req, res, next) => {
  if (req.method !== "POST" || !STRICT_AUTH_RATE_LIMIT_PATHS.has(req.path)) {
    next();
    return;
  }

  strictAuthRateLimiter(req, res, next);
});
app.use(TABLE_ALLOCATIONS_POLL_PATH, (req, res, next) => {
  if (req.method !== "GET") {
    next();
    return;
  }

  tableAllocationsPollRateLimiter(req, res, next);
});

// Root: welcome message when accessing backend URL /
app.get("/", (_req, res) => {
  res.status(200).json({ message: "Hello, welcome to the application." });
});

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
