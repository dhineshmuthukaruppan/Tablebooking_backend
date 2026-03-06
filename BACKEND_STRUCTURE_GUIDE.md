# Table Booking Backend – Structure Guide

Use this document to keep the backend aligned with a **domain-based** layout. This project does **not** use a top-level `modules/` layer; domains are expressed as **route folders** and **controller folders** only.

---

## 1. High-Level Structure (No “Modules”)

- There is **no** `src/modules/` directory. Do not introduce a modules layer.
- Domains are represented by:
  - **Routes**: `src/routes/<domain>/` (e.g. `routes/auth/`, `routes/admin/`)
  - **Controllers**: `src/controllers/<domain>/` (e.g. `controllers/auth/`, `controllers/admin/`)
- Shared pieces: `config/`, `services/`, `lib/`, `middlewares/`.

```
Tablebooking_backend/src/
├── config/           # Environment, Firebase, DB, logger
├── controllers/      # Domain-based handlers (no modules wrapper)
├── lib/              # DB collections/types, auth helpers (e.g. verifyFirebaseToken)
├── middlewares/      # Auth, RBAC, error, not-found
├── routes/           # Route aggregator + domain route folders
├── services/         # Auth (authentication, privilege)
├── constants/        # e.g. roles
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
- Dependencies: `config/`, `lib/db/`, `lib/auth/`, `services/` as needed. Use try/catch and send appropriate HTTP status and JSON.

---

## 3. Routes Structure

- **Domain route files**: `src/routes/<domain>/<domain>.routes.ts` (e.g. `auth/auth.routes.ts`, `bookings/bookings.routes.ts`) — builds the Express router for that domain. Do not use `index.ts` inside domain folders so the only index is the main aggregator.
- **Aggregator**: `src/routes/index.ts` — the only index in routes; imports from each domain’s `*.routes.ts` and mounts them on the v1 router.

**Route file pattern:**

- Use `express.Router()`.
- Require **controllers** from `../../controllers/<domain>/` (or via index).
- Require **services** from `../../services` for auth (e.g. `authenticate`, `requireRoles`).
- Define routes: `router.<method>(path, ...middlewares, handler)`.
- Export the router.

**No “modules”**: routes reference only **controllers** and **services**.

---

## 4. App / Server – Route Mounting

- Load routes from `./routes` (v1Router).
- Mount once: `app.use("/api/v1", v1Router)`.
- Apply global middleware (cors, helmet, rate limit, etc.) in `app.ts` before the router.

---

## 5. What Not to Do

- **Do not** add a top-level **modules** directory.
- **Do not** have routes or app depend on “modules”; they depend only on:
  - **controllers** (by path)
  - **services**
  - **config** / **lib** / **middlewares**

---

## 6. Checklist for New Features

- [ ] No `modules/` layer; use **controllers/<domain>/** and **routes/<domain>/** only.
- [ ] One **routes/index.ts** that imports domain routers and mounts them under the v1 router.
- [ ] New domain = new folder under `controllers/` and under `routes/` with handler and route files.
- [ ] Controllers use async handlers and use **config**, **lib**, **services** as needed.
- [ ] Shared auth/DB helpers live in **lib/** (e.g. `lib/auth/verifyFirebaseToken.ts`) or **services/**.
