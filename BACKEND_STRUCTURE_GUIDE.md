# Table Booking Backend – Structure Guide

Use this document to keep the backend aligned with a **domain-based** layout. This project does **not** use a top-level `modules/` layer; domains are expressed as **route folders** and **controller folders** only.

---

## 1. High-Level Structure (No “Modules”)

- There is **no** `src/modules/` directory. Do not introduce a modules layer.
- Domains are represented by:
  - **Routes**: `src/routes/<domain>/` (e.g. `routes/auth/`, `routes/admin/`)
  - **Controllers**: `src/controllers/<domain>/` (e.g. `controllers/auth/`, `controllers/admin/`)
- Shared pieces: `config/`, `databaseUtilities/`, `services/`, `lib/`, `middlewares/`.

```
Tablebooking_backend/src/
├── config/              # Environment, Firebase, DB, logger
├── controllers/         # Domain-based handlers (no modules wrapper)
├── databaseUtilities/   # MongoDB read, create, update; constants (dbTables, connectionStrings)
├── lib/                 # DB types, auth helpers (e.g. verifyFirebaseToken)
├── middlewares/         # Auth, RBAC, error, not-found
├── routes/              # Route aggregator + domain route folders
├── services/            # Auth (authentication, privilege)
├── constants/           # e.g. roles
└── app.ts / server.ts
```

---

## 2. Controllers Structure

- One **folder per domain** under `controllers/`.
- Inside a domain folder:
  - **Handler files**: `*.handler.ts` (e.g. `signin.handler.ts`, `register.handler.ts`, `users.handler.ts`).
  - **index.ts**: Re-exports handlers for the domain.
- Optional: `prepareAndValidate/`, `privateFunctions/` for validators and internal helpers.

**Pattern:**

```
controllers/
├── auth/
│   ├── index.ts
│   ├── signin.handler.ts
│   └── getMe.handler.ts
├── user_registration/
│   ├── index.ts
│   └── register.handler.ts
├── admin/
│   ├── index.ts
│   ├── dashboard.handler.ts
│   └── users.handler.ts
└── … (bookings, coupons, feedback, videos)
```

- Handlers are **async** and use `(req, res)` or `(req, res, next)`.
- **MongoDB access**: Use **databaseUtilities** (`db`), not direct `getDb()`/`getUsersCollection()` in controllers or middleware. Example:
  - `import db from "../../databaseUtilities";`
  - `await db.read.findOne({ req, connectionString: db.constants.connectionStrings.tableBooking, collection: "users", query: { firebaseUid } });`
  - `await db.create.insertOne({ req, connectionString, collection: "users", payload });`
  - `await db.update.updateOne({ req, connectionString, collection: "users", query, update });`
- Other dependencies: `config/`, `lib/auth/`, `services/` as needed. Use try/catch and send appropriate HTTP status and JSON.

---

## 3. Routes Structure

- **Domain route files**: `src/routes/<domain>/<domain>.routes.ts` (e.g. `auth/auth.routes.ts`, `bookings/bookings.routes.ts`) — builds the Express router for that domain. Do not use `index.ts` inside domain folders so the only index is the main aggregator.
- **V1 aggregator**: `src/routes/index.ts` — imports from each domain’s `*.routes.ts` and builds the v1 router (no mount path; it is mounted by the API aggregator).
- **API version aggregator**: `src/routes/api.routes.ts` — mounts versioned routers under `/v1`, `/v2`, etc. All version logic lives here.

**Route file pattern:**

- Use `express.Router()`.
- Require **controllers** from `../../controllers/<domain>/` (or via index).
- Require **services** from `../../services` for auth (e.g. `authenticate`, `requireRoles`).
- Define routes: `router.<method>(path, ...middlewares, handler)`.
- Export the router.

**No “modules”**: routes reference only **controllers** and **services**.

---

## 4. App / Server – Route Mounting

- Load the API aggregator from `./routes/api.routes` (apiRouter).
- Mount once: `app.use("/api", apiRouter)`. All versions live under `/api` (e.g. `/api/v1/health`, `/api/v2/health`).
- Apply global middleware (cors, helmet, rate limit, etc.) in `app.ts` before the router.
- Do **not** register versioned routes directly on `app` (e.g. no `app.get("/api/v1/...")`); all go through the versioned routers.

---

## 5. API Versioning

- **Strategy**: Path-based versioning. All versions are under `/api/<version>` (e.g. `/api/v1`, `/api/v2`).
- **Version registry**: `src/config/api-versions.ts` — lists supported versions, default version, and optional deprecation (sunset date, successor link). Use this when adding or deprecating versions.
- **Adding a new version**: (1) Create a new router (e.g. `v2Router` in a new file or under `routes/`). (2) Register it in `src/routes/api.routes.ts`: `apiRouter.use("/v2", versionHeadersMiddleware("v2"), v2Router)`. (3) Add the version to `src/config/api-versions.ts` in `API_VERSIONS`.
- **Table-master and other routes**: Live only inside the versioned router tree (e.g. v1Router or admin/master routes). Not on `app` directly.
- **Deprecation**: Mark a version as deprecated in `api-versions.ts` (`deprecated: true`, optional `sunsetDate`, `linkSuccessor`). The API router middleware sets `X-API-Version`, and for deprecated versions sets `Deprecation: true`, `Sunset`, and `Link` headers.
- **Health**: Versioned health at `GET /api/v1/health`. Optional version-agnostic health at `GET /api/health`.

---

## 6. What Not to Do

- **Do not** add a top-level **modules** directory.
- **Do not** have routes or app depend on “modules”; they depend only on:
  - **controllers** (by path)
  - **services**
  - **config** / **lib** / **middlewares**

---

## 7. Checklist for New Features

- [ ] No `modules/` layer; use **controllers/<domain>/** and **routes/<domain>/** only.
- [ ] **routes/index.ts** builds the v1 router; **routes/api.routes.ts** mounts v1 (and future versions) under `/api`.
- [ ] New domain = new folder under `controllers/` and under `routes/` with handler and route files.
- [ ] Controllers use async handlers and use **config**, **lib**, **services** as needed.
- [ ] All MongoDB operations go through **databaseUtilities** (`db.read`, `db.create`, `db.update`, `db.constants`).
- [ ] Shared auth helpers live in **lib/** (e.g. `lib/auth/verifyFirebaseToken.ts`) or **services/**.
