import type { Request } from "express";
import {
  findAdminUserByEmail,
  findGuestDatesConfig,
  upsertGuestDatesConfig,
} from "../../repositories/guestDates.repository";
import { getAdminEmail } from "../../lib/getAdminEmail";
import db from "../../databaseUtilities";

export interface GuestDatesConfig {
  maxGuestCount: number;
  maxDaysCount: number;
  allowBookingWhenSlotFull: boolean;
  adminEmail: string | null;
}

export interface UpdateGuestDatesConfigInput {
  maxGuestCount?: number;
  maxDaysCount?: number;
  allowBookingWhenSlotFull?: boolean;
  adminEmail?: string | null;
}

class GuestDatesConfigError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "GuestDatesConfigError";
  }
}

function normalizeEmail(email?: string | null): string | null {
  if (typeof email !== "string") {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  return normalized ? normalized : null;
}

export async function resolveAdminContactEmail(
  req: Request,
  requestedAdminEmail?: string | null
): Promise<string> {
  const normalizedRequestedEmail = normalizeEmail(requestedAdminEmail);

  // When an explicit value is provided (e.g. from Admin Contact Email save),
  // validate that it belongs to an admin user.
  if (normalizedRequestedEmail) {
    const adminUser = await findAdminUserByEmail(req, normalizedRequestedEmail);
    const adminUserEmail = normalizeEmail(adminUser?.email);

    if (!adminUserEmail) {
      throw new GuestDatesConfigError(
        "Selected admin contact email must belong to an admin user.",
        400
      );
    }

    return adminUserEmail;
  }

  // No explicit email provided – resolve via shared helper (guest_date, then users).
  const adminEmail = await getAdminEmail(req, db.constants.connectionStrings.tableBooking);
  if (!adminEmail) {
    throw new GuestDatesConfigError(
      "No system admin email is configured. Please create a system admin user first.",
      500
    );
  }

  return adminEmail;
}

export async function getGuestDatesConfig(
  req: Request
): Promise<GuestDatesConfig> {
  const [doc, fallbackAdminEmail] = await Promise.all([
    findGuestDatesConfig(req),
    getAdminEmail(req, db.constants.connectionStrings.tableBooking),
  ]);

  return {
    maxGuestCount: doc?.maxGuestCount ?? 0,
    maxDaysCount: doc?.maxDaysCount ?? 0,
    allowBookingWhenSlotFull: doc?.allowBookingWhenSlotFull ?? false,
    adminEmail: normalizeEmail(doc?.adminEmail) ?? fallbackAdminEmail,
  };
}

export async function updateGuestDatesConfig(
  req: Request,
  payload: UpdateGuestDatesConfigInput
): Promise<GuestDatesConfig> {
  const updateFields: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (payload.maxGuestCount !== undefined) {
    updateFields.maxGuestCount = payload.maxGuestCount;
  }
  if (payload.maxDaysCount !== undefined) {
    updateFields.maxDaysCount = payload.maxDaysCount;
  }
  if (payload.allowBookingWhenSlotFull !== undefined) {
    updateFields.allowBookingWhenSlotFull = payload.allowBookingWhenSlotFull;
  }
  if (payload.adminEmail !== undefined) {
    updateFields.adminEmail = await resolveAdminContactEmail(req, payload.adminEmail);
  }

  if (Object.keys(updateFields).length <= 1) {
    throw new GuestDatesConfigError(
      "Provide maxGuestCount, maxDaysCount, allowBookingWhenSlotFull and/or adminEmail.",
      400
    );
  }

  await upsertGuestDatesConfig(req, updateFields);
  return getGuestDatesConfig(req);
}

export function isGuestDatesConfigError(
  error: unknown
): error is GuestDatesConfigError {
  return error instanceof GuestDatesConfigError;
}
