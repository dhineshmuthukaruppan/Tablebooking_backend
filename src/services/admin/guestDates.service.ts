import type { Request } from "express";
import {
  findAdminUserByEmail,
  findFirstSystemAdminUser,
  findGuestDatesConfig,
  upsertGuestDatesConfig,
} from "../../repositories/guestDates.repository";

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

async function getSystemAdminEmail(req: Request): Promise<string | null> {
  const systemAdmin = await findFirstSystemAdminUser(req);
  return normalizeEmail(systemAdmin?.email);
}

export async function resolveAdminContactEmail(
  req: Request,
  requestedAdminEmail?: string | null
): Promise<string> {
  const normalizedRequestedEmail = normalizeEmail(requestedAdminEmail);

  if (!normalizedRequestedEmail) {
    const systemAdminEmail = await getSystemAdminEmail(req);
    if (!systemAdminEmail) {
      throw new GuestDatesConfigError(
        "No system admin email is configured. Please create a system admin user first.",
        500
      );
    }

    return systemAdminEmail;
  }

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

export async function getGuestDatesConfig(
  req: Request
): Promise<GuestDatesConfig> {
  const [doc, systemAdminEmail] = await Promise.all([
    findGuestDatesConfig(req),
    getSystemAdminEmail(req),
  ]);

  return {
    maxGuestCount: doc?.maxGuestCount ?? 0,
    maxDaysCount: doc?.maxDaysCount ?? 0,
    allowBookingWhenSlotFull: doc?.allowBookingWhenSlotFull ?? false,
    adminEmail: normalizeEmail(doc?.adminEmail) ?? systemAdminEmail,
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
