interface BookingSmsTemplateData {
  bookingId?: string;
  date: string;
  time: string;
  guests?: number;
}

export function bookingConfirmedSMS(data: BookingSmsTemplateData): string {
  return [
    "The Sheesha Factory",
    "",
    "Your booking is CONFIRMED.",
    "",
    `Booking Id: ${data.bookingId ?? ""}`,
    `Date: ${data.date}`,
    `Time: ${data.time}`,
    `Guests: ${data.guests ?? 0}`,
    "",
    "We look forward to hosting you!",
  ].join("\n");
}

export function bookingCancelledSMS(data: BookingSmsTemplateData): string {
  return [
    "The Sheesha Factory",
    "",
    "Your booking has been CANCELLED.",
    "",
    `Date: ${data.date}`,
    `Time: ${data.time}`,
    "",
    "You can book again anytime.",
  ].join("\n");
}
