import type { Request } from "express";
import db from "../databaseUtilities";

const GUEST_DATE_QUERY = { type: "default" } as const;

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
}

/**
 * Returns the admin contact email for notifications.
 *
 * Resolution order:
 * 1. guest_date.type === "default".adminEmail (if present and valid)
 * 2. First admin user (role: "admin") with a non-empty email, sorted by createdAt ascending
 * 3. null when nothing is found
 */
export async function getAdminEmail(
  req: Request,
  connectionString: string
): Promise<string | null> {
  // 1) Try guest_date config adminEmail
  const guestDateConfig = (await db.read.findOne({
    req,
    connectionString,
    collection: db.constants.dbTables.guest_date,
    query: GUEST_DATE_QUERY,
    projection: { adminEmail: 1 },
  })) as { adminEmail?: unknown } | null;

  const configEmail = normalizeEmail(guestDateConfig?.adminEmail);
  if (configEmail) {
    return configEmail;
  }

  // 2) Fallback: first admin user with a valid email
  const admins = (await db.read.find({
    req,
    connectionString,
    collection: db.constants.dbTables.users,
    query: {
      role: "admin",
      email: { $exists: true, $nin: [null, ""] },
    },
    projection: { email: 1, createdAt: 1 },
    sort: { createdAt: 1 },
    limit: 1,
  })) as Array<{ email?: unknown }> | null;

  const adminEmail = normalizeEmail(admins?.[0]?.email);
  return adminEmail ?? null;
}

