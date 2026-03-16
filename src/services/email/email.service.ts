import type { Request } from "express";
import type { BookingConfirmationEmailPayload } from "../../types/email";
import { resolveAdminContactEmail } from "../admin/guestDates.service";
import { generateBookingConfirmationHTML } from "./templates/bookingConfirmationTemplate";
import { generateBookingAdminStatusHTML } from "./templates/bookingAdminStatusTemplate";
import { generateBookingCancellationHTML } from "./templates/bookingCancellationTemplate";
import { generateBookingAdminPhoneUserHTML } from "./templates/bookingAdminPhoneUserTemplate";
import { triggerFirebaseEmail } from "./firebaseEmailTrigger";

function getNormalizedEmail(email?: string | null): string | null {
  if (typeof email !== "string") {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  return normalized || null;
}

async function resolveAdminRecipient(
  req: Request,
  payload: BookingConfirmationEmailPayload,
  event: "confirmation" | "cancellation"
): Promise<string | null> {
  const requestedAdminEmail = getNormalizedEmail(payload.adminEmail);
  if (requestedAdminEmail) {
    return requestedAdminEmail;
  }

  try {
    return await resolveAdminContactEmail(req);
  } catch (error) {
    console.error(`[email] Failed to resolve admin contact email for ${event}`, error);
    return null;
  }
}

async function sendCustomerBookingEmail({
  payload,
  subject,
  html,
  event,
}: {
  payload: BookingConfirmationEmailPayload;
  subject: string;
  html: string;
  event: "confirmation" | "cancellation";
}): Promise<void> {
  const customerEmail = getNormalizedEmail(payload.customerEmail);

  console.info(`[email] Building booking ${event} email for customer`, {
    bookingId: payload.bookingId,
    customerRecipient: customerEmail,
    section: payload.section,
  });

  if (!customerEmail) {
    return;
  }

  await triggerFirebaseEmail({
    to: [customerEmail],
    subject,
    html,
  });

  console.info(`[email] Booking ${event} email handed to queue layer for customer`, {
    bookingId: payload.bookingId,
    customerRecipient: customerEmail,
  });
}

async function sendAdminBookingEmail({
  req,
  payload,
  subject,
  html,
  event,
}: {
  req: Request;
  payload: BookingConfirmationEmailPayload;
  subject: string;
  html: string;
  event: "confirmation" | "cancellation";
}): Promise<void> {
  const adminEmail = await resolveAdminRecipient(req, payload, event);

  console.info(`[email] Building booking ${event} email for admin`, {
    bookingId: payload.bookingId,
    adminRecipient: adminEmail,
    customerId: payload.customerId ?? null,
    section: payload.section,
  });

  if (!adminEmail) {
    return;
  }

  await triggerFirebaseEmail({
    to: [adminEmail],
    subject,
    html,
  });

  console.info(`[email] Booking ${event} email handed to queue layer for admin`, {
    bookingId: payload.bookingId,
    adminRecipient: adminEmail,
    customerId: payload.customerId ?? null,
  });
}

export async function sendBookingConfirmationEmail(
  payload: BookingConfirmationEmailPayload
): Promise<void> {
  await sendCustomerBookingEmail({
    payload,
    subject: "Booking Confirmed - The Sheesha Factory",
    html: generateBookingConfirmationHTML(payload),
    event: "confirmation",
  });
}

export async function sendAdminBookingConfirmationEmail(
  req: Request,
  payload: BookingConfirmationEmailPayload
): Promise<void> {
  await sendAdminBookingEmail({
    req,
    payload,
    subject: "Booking Confirmed - Admin Notification - The Sheesha Factory",
    html: generateBookingAdminStatusHTML("confirmed", payload),
    event: "confirmation",
  });
}

export async function sendBookingCancellationEmail(
  payload: BookingConfirmationEmailPayload
): Promise<void> {
  await sendCustomerBookingEmail({
    payload,
    subject: "Booking Cancelled - The Sheesha Factory",
    html: generateBookingCancellationHTML(payload),
    event: "cancellation",
  });
}

export async function sendAdminBookingCancellationEmail(
  req: Request,
  payload: BookingConfirmationEmailPayload
): Promise<void> {
  await sendAdminBookingEmail({
    req,
    payload,
    subject: "Booking Cancelled - Admin Notification - The Sheesha Factory",
    html: generateBookingAdminStatusHTML("cancelled", payload),
    event: "cancellation",
  });
}

export async function sendAdminPhoneUserBookingEmail(
  req: Request,
  payload: BookingConfirmationEmailPayload
): Promise<void> {
  const adminEmail = await resolveAdminRecipient(req, payload, "confirmation");

  console.info("[email] Building phone-user booking email for admin", {
    bookingId: payload.bookingId,
    adminRecipient: adminEmail,
    customerId: payload.customerId ?? null,
    customerPhone: payload.customerPhone ?? null,
  });

  if (!adminEmail) {
    return;
  }

  await triggerFirebaseEmail({
    to: [adminEmail],
    subject: "New Booking from Phone User",
    html: generateBookingAdminPhoneUserHTML(payload),
  });

  console.info("[email] Phone-user booking email handed to queue layer for admin", {
    bookingId: payload.bookingId,
    adminRecipient: adminEmail,
    customerId: payload.customerId ?? null,
    customerPhone: payload.customerPhone ?? null,
  });
}

