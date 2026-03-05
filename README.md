# Table Booking Backend

Backend foundation for **The Sheesha Factory** using:

- Node.js + Express.js
- MongoDB (native driver; see [docs/schema.md](docs/schema.md) for document shapes and indexes)
- Firebase Admin SDK (JWT verification)
- RBAC middleware scaffold
- API versioning with `/api/v1`

## Git & branching

- `main` – stable/production branch.
- Optional `develop` – integration branch for features.
- Feature branches: `feature/<short-description>`.
- Prefer pull requests into `develop` or `main` with review.

## Quick Start

1. Install dependencies:
   - `npm install`
2. Create env file:
   - `cp .env.example .env`
3. Fill all required environment variables.
4. Run development server:
   - `npm run dev`

## Scripts

- `npm run dev` - start in watch mode with tsx
- `npm run build` - compile TypeScript to `dist`
- `npm run start` - run compiled server
- `npm run lint` - run ESLint
- `npm run typecheck` - run TypeScript checks

## Environments

- **development** – Local: `NODE_ENV=development`, use `.env` with local MongoDB and Firebase project. Run with `npm run dev`.
- **staging / production** – Cloud (e.g. GCP): set `NODE_ENV`, `MONGODB_URI` (e.g. Atlas), `CORS_ORIGIN` to your frontend origin, and Firebase credentials (or GCP default credentials). Deploy the compiled app (e.g. `npm run build && npm start`) on Compute Engine or a container.

See `.env.example` for all variables. Key differences per environment: `MONGODB_URI`, `CORS_ORIGIN`, and Firebase keys.

## Observability (Grafana, Loki, OpenTelemetry)

- **Structured logging:** The app logs JSON to stdout (timestamp, level, message, context) for easy ingestion by Loki or any log aggregator.
- **OpenTelemetry:** If `OTEL_ENABLED` is not `false`, tracing is started from `src/instrumentation.ts` (loaded before the app). Set `OTEL_EXPORTER_OTLP_ENDPOINT` (e.g. `http://localhost:4318/v1/traces`) to send traces to an OTLP collector or Jaeger. Auto-instrumentation covers HTTP and Express.
- **Loki + Grafana (optional):** Run the stack with:
  - `docker compose -f docker-compose.observability.yml up -d`
  - Add Loki as a data source in Grafana at `http://localhost:3002` (default login `admin` / `admin`): URL `http://loki:3100`.
  - To ship backend logs: redirect stdout to a file (e.g. `npm run dev 2>&1 | tee /var/log/tablebooking-backend.log`) and point Promtail at that path, or use a log driver that forwards to Loki.

## API Base

- `http://localhost:5000/api/v1`

## RBAC

- **Roles:** `admin`, `staff`, `user` (stored in MongoDB users collection). Map to FRD: Visitor (unauthenticated), Registered User (`user`), Verified Customer (`user` + email verified), Admin, Staff.
- **Protected routes:** Admin-only endpoints use `authenticate` + `requireRoles("admin")`. Admin/staff endpoints use `requireRoles("admin", "staff")`. See `src/middlewares/rbac.middleware.ts`.

## Scaffolded Endpoints

- `GET /health`
- `GET /auth/me` (requires Firebase bearer token)
- `GET /bookings` (requires auth)
- `GET /coupons`
- `POST /coupons/redeem` (requires auth)
- `GET /feedback`
- `POST /feedback` (requires auth)
- `GET /videos`
- `POST /videos` (admin/staff only)
- `GET /admin/dashboard` (admin/staff only)
- `GET /admin/users` (admin only; paginated, filters: role, isEmailVerified, isEligibleForCoupons)
- `PATCH /admin/users/:id` (admin only; body: role, isEligibleForCoupons)

**Postman:** Import `postman/Auth-and-Verification.json` for auth and admin user endpoints. Set collection variables `baseUrl` (e.g. `http://localhost:5000/api/v1`) and `bearerToken` (Firebase ID token from the client after login).
