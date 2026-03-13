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
