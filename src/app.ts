import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import * as tableMasterHandler from "./controllers/admin/master/table-master.handler";
import { errorHandler } from "./middlewares/error.middleware";
import { notFoundHandler } from "./middlewares/not-found.middleware";
import { v1Router } from "./routes";
import { auth } from "./services";

const app = express();

// CORS: allow frontend origin so browser preflight (OPTIONS) and actual requests succeed
const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
if (allowedOrigins.length === 0) allowedOrigins.push("http://localhost:3000");

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
app.use(
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Table master: register before v1Router so this path is handled here
const tableMasterAuth = [auth.authentication.authenticate, auth.privilege.requireRoles("admin", "staff")];
app.get("/api/v1/admin/master/table-master", ...tableMasterAuth, tableMasterHandler.getTableMasterConfigHandler);
app.put("/api/v1/admin/master/table-master", ...tableMasterAuth, tableMasterHandler.putTableMasterConfigHandler);
// Ping to confirm this code is running: open http://localhost:5001/api/v1/admin/master/table-master-ping (should return {"tableMasterRoute":"registered"})
app.get("/api/v1/admin/master/table-master-ping", (_req, res) => res.status(200).json({ tableMasterRoute: "registered" }));
console.log("[app] Table master: GET/PUT /api/v1/admin/master/table-master + ping at .../table-master-ping");

app.use("/api/v1", v1Router);
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
