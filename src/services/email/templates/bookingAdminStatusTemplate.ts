import type { BookingConfirmationEmailPayload } from "../../../types/email";

type BookingAdminEmailEvent = "confirmed" | "cancelled";

function getAdminTitle(event: BookingAdminEmailEvent): string {
  return event === "confirmed"
    ? "Booking Confirmation"
    : "Booking Cancellation";
}

function getAdminIntro(event: BookingAdminEmailEvent): string {
  return event === "confirmed"
    ? "A pending booking has been confirmed."
    : "A pending booking has been cancelled.";
}

export function generateBookingAdminStatusHTML(
  event: BookingAdminEmailEvent,
  data: BookingConfirmationEmailPayload
): string {
  const slot = `${data.startTime} - ${data.endTime}`;

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${getAdminTitle(event)}</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        background-color: #f5f5f5;
        font-family: Arial, sans-serif;
        color: #222222;
      }
      .container {
        max-width: 640px;
        margin: 0 auto;
        padding: 16px;
      }
      .card {
        background-color: #ffffff;
        border-radius: 8px;
        padding: 24px 20px 28px;
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
      }
      .title {
        font-size: 20px;
        font-weight: 700;
        color: #111827;
        margin: 0 0 8px;
      }
      .subtitle {
        font-size: 14px;
        color: #4b5563;
        margin: 0 0 20px;
      }
      .details-table {
        width: 100%;
        border-collapse: collapse;
      }
      .details-table th,
      .details-table td {
        text-align: left;
        padding: 10px 6px;
        font-size: 14px;
        border-bottom: 1px solid #e5e7eb;
      }
      .details-table th {
        width: 34%;
        color: #6b7280;
        font-weight: 600;
      }
      .details-table td {
        color: #111827;
      }
      .footer {
        margin-top: 20px;
        font-size: 12px;
        color: #9ca3af;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="card">
        <p class="title">${getAdminTitle(event)}</p>
        <p class="subtitle">${getAdminIntro(event)}</p>

        <table class="details-table" role="presentation" cellspacing="0" cellpadding="0">
          <tr>
            <th>Customer ID</th>
            <td>${data.customerId ?? "-"}</td>
          </tr>
          <tr>
            <th>Customer Name</th>
            <td>${data.customerName || "-"}</td>
          </tr>
          <tr>
            <th>Booking ID</th>
            <td>${data.bookingId}</td>
          </tr>
          <tr>
            <th>Booking Date</th>
            <td>${data.bookingDate}</td>
          </tr>
          <tr>
            <th>Slot</th>
            <td>${slot}</td>
          </tr>
          <tr>
            <th>Guest Count</th>
            <td>${data.guests}</td>
          </tr>
        </table>

        <div class="footer">
          This is an automated message from the booking system.
        </div>
      </div>
    </div>
  </body>
</html>
`;
}
