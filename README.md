# Table Booking Backend

Backend foundation for **The Sheesha Factory** using:

- Node.js + Express.js
- MongoDB (Mongoose)
- Firebase Admin SDK (JWT verification)
- RBAC middleware scaffold
- API versioning with `/api/v1`

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

## API Base

- `http://localhost:5000/api/v1`

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
