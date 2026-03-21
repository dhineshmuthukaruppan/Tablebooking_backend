import type { Request } from "express";
import db from "../databaseUtilities";

const GENERAL_MASTER_QUERY = { type: "default" } as const;

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
}

/**
 * Returns the admin contact email for notifications.
 *
 * Resolution order:
 * 1. general_master.type === "default".adminEmail (if present and valid)
 * 2. First admin user (role: "admin") with a non-empty email, sorted by createdAt ascending
 * 3. null when nothing is found
 */
export async function getAdminEmail(
  req: Request,
  connectionString: string
): Promise<string | null> {
  // 1) Try general_master config adminEmail
  const generalMasterConfig = (await db.read.findOne({
    req,
    connectionString,
    collection: db.constants.dbTables.general_master,
    query: GENERAL_MASTER_QUERY,
    projection: { adminEmail: 1 },
  })) as { adminEmail?: unknown } | null;

  const configEmail = normalizeEmail(generalMasterConfig?.adminEmail);
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

