# Database schema (MongoDB native)

This document describes the document shapes and indexes used by the Table Booking backend. The backend uses the **native MongoDB driver** (no Mongoose). Future phases will add collections from the Table booking software collections spec (Settings, Section master, Coupons, Redeem, Booking).

## Collections

### `users`

Stores user profiles synced from Firebase Authentication. One document per user, keyed by `firebaseUid`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | ObjectId | (auto) | MongoDB document ID |
| `firebaseUid` | string | yes | Firebase Auth UID (unique) |
| `email` | string | no | User email (unique, lowercase) when using email auth |
| `phoneNumber` | string \| null | no | User phone number in E.164 format (e.g. `+971501234567`) when using phone auth |
| `role` | string | yes | One of `admin`, `staff`, `user` |
| `isEmailVerified` | boolean | yes | Whether email is verified (from Firebase claim) |
| `isPhoneVerified` | boolean | yes | Whether phone is verified (derived from Firebase phone auth / phone_number claim) |
| `authProvider` | string | no | Primary auth provider for this user, one of `email` or `phone` |
| `isEligibleForCoupons` | boolean | no | Eligibility for coupon redemption (default false; rules in Coupons milestone) |
| `createdAt` | Date | no | Set on insert |
| `updatedAt` | Date | no | Set on insert/update |

**Indexes:**

- `firebaseUid` (unique)
- `email` (unique)

### `menu_categories`

Menu categories (e.g. Breakfast, Soups) for the restaurant menu. Slug is used in public URLs.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | ObjectId | (auto) | Document ID |
| `name` | string | yes | Display name (e.g. "Breakfast", "Soups") |
| `slug` | string | yes | URL-safe unique identifier |
| `coverImage` | string | no | GCS object name; served via `/api/v1/photos/serve?object=...` |
| `order` | number | yes | Display order (lower first) |
| `isActive` | boolean | yes | Default true; if false, hide from public menu |
| `createdAt` | Date | no | Set on insert |
| `updatedAt` | Date | no | Set on update |

**Indexes:**

- `slug` (unique)
- `order` (asc)

### `menu_products`

Dishes/products within a category. Slug is used in public URLs.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | ObjectId | (auto) | Document ID |
| `name` | string | yes | Dish name |
| `slug` | string | yes | URL-safe; unique globally |
| `categoryId` | ObjectId | yes | Reference to `menu_categories._id` |
| `price` | number | yes | Numeric price |
| `currency` | string | yes | e.g. "AED", "INR" |
| `image` | string | no | GCS object name for dish image |
| `description` | string | no | Text description |
| `tags` | string[] | no | e.g. `["veg"]`, `["non-veg"]`, `["spicy"]` |
| `isAvailable` | boolean | yes | Default true |
| `createdAt` | Date | no | Set on insert |
| `updatedAt` | Date | no | Set on update |

**Indexes:**

- `slug` (unique)
- `categoryId` (for listing by category)
