import type { BookingConfirmationEmailPayload } from "../../types/email";
import { generateBookingConfirmationHTML } from "./templates/bookingConfirmationTemplate";
import { generateBookingCancellationHTML } from "./templates/bookingCancellationTemplate";
import { triggerFirebaseEmail } from "./firebaseEmailTrigger";

async function queueBookingEmail({
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
  console.info(`[email] Building booking ${event} email`, {
    bookingId: payload.bookingId,
    to: payload.customerEmail,
    section: payload.section,
  });

  await triggerFirebaseEmail({
    to: payload.customerEmail,
    subject,
    html,
  });

  if (event === "cancellation") {
    console.log("EMAIL DEBUG → Firestore mail document created for cancellation");
  }

  console.info(`[email] Booking ${event} email handed to queue layer`, {
    bookingId: payload.bookingId,
    to: payload.customerEmail,
  });
}

export async function sendBookingConfirmationEmail(
  payload: BookingConfirmationEmailPayload
): Promise<void> {
  await queueBookingEmail({
    payload,
    subject: "Booking Confirmed - The Sheesha Factory",
    html: generateBookingConfirmationHTML(payload),
    event: "confirmation",
  });
}

export async function sendBookingCancellationEmail(
  payload: BookingConfirmationEmailPayload
): Promise<void> {
  await queueBookingEmail({
    payload,
    subject: "Booking Cancelled - The Sheesha Factory",
    html: generateBookingCancellationHTML(payload),
    event: "cancellation",
  });
}

