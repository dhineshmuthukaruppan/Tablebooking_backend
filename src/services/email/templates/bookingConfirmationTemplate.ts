import type { BookingConfirmationEmailPayload } from "../../../types/email";

export function generateBookingConfirmationHTML(
  data: BookingConfirmationEmailPayload
): string {
  const {
    customerName,
    bookingId,
    bookingDate,
    startTime,
    endTime,
    guests,
    section,
    venueName,
    location,
  } = data;

  const safeName = customerName || "Guest";

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your Table Booking is Confirmed</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        background-color: #f5f5f5;
        font-family: Arial, sans-serif;
        color: #222222;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 16px;
      }
      .card {
        background-color: #ffffff;
        border-radius: 8px;
        padding: 24px 20px 28px;
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
      }
      .header {
        text-align: center;
        margin-bottom: 24px;
      }
      .logo {
        font-size: 20px;
        font-weight: 700;
        color: #111827;
        letter-spacing: 0.04em;
      }
      .subtitle {
        font-size: 12px;
        color: #6b7280;
        margin-top: 4px;
      }
      .title {
        font-size: 18px;
        font-weight: 600;
        margin: 16px 0 8px;
        color: #111827;
      }
      .text {
        font-size: 14px;
        line-height: 1.6;
        color: #374151;
        margin: 0 0 12px;
      }
      .details-table {
        width: 100%;
        border-collapse: collapse;
        margin: 16px 0 8px;
      }
      .details-table th,
      .details-table td {
        text-align: left;
        padding: 8px 6px;
        font-size: 13px;
      }
      .details-table th {
        width: 34%;
        color: #6b7280;
        font-weight: 500;
      }
      .details-table td {
        color: #111827;
        font-weight: 500;
      }
      .divider {
        border-top: 1px solid #e5e7eb;
        margin: 20px 0;
      }
      .location-block {
        margin-bottom: 12px;
      }
      .location-title {
        font-size: 14px;
        font-weight: 600;
        color: #111827;
        margin: 0 0 6px;
      }
      .location-text {
        font-size: 13px;
        color: #4b5563;
        margin: 0 0 8px;
      }
      .button-link {
        display: inline-block;
        padding: 10px 18px;
        border-radius: 999px;
        background-color: #f97316;
        color: #ffffff !important;
        text-decoration: none;
        font-size: 13px;
        font-weight: 600;
      }
      .button-link:hover {
        background-color: #ea580c;
      }
      .footer {
        margin-top: 16px;
        font-size: 12px;
        color: #9ca3af;
        text-align: center;
      }
      @media (max-width: 640px) {
        .card {
          padding: 20px 16px 24px;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="card">
        <div class="header">
          <div class="logo">${venueName}</div>
          <div class="subtitle">${location}</div>
        </div>

        <p class="title">Your table booking is confirmed 🍽️</p>
        <p class="text">
          Hello ${safeName},
        </p>
        <p class="text">
          Your table booking has been successfully confirmed. We&apos;re excited to host you and your guests.
        </p>

        <table class="details-table" role="presentation" cellspacing="0" cellpadding="0">
          <tr>
            <th>Booking ID</th>
            <td>${bookingId}</td>
          </tr>
          <tr>
            <th>Date</th>
            <td>${bookingDate}</td>
          </tr>
          <tr>
            <th>Time</th>
            <td>${startTime} – ${endTime}</td>
          </tr>
          <tr>
            <th>Guests</th>
            <td>${guests}</td>
          </tr>
          <tr>
            <th>Section</th>
            <td>${section}</td>
          </tr>
        </table>

        <div class="divider"></div>

        <div class="location-block">
          <p class="location-title">Location</p>
          <p class="location-text">
            ${venueName}<br />
            ${location}
          </p>
          <a
            href="https://www.google.com/maps/search/${encodeURIComponent(
              venueName + " " + location
            )}"
            class="button-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Google Maps
          </a>
        </div>

        <div class="divider"></div>

        <p class="text">
          If you need to make any changes to your booking, please contact us at your earliest convenience.
        </p>
        <p class="text" style="margin-bottom: 0;">
          Thank you for choosing <strong>${venueName}</strong>. We look forward to welcoming you.
        </p>

        <div class="footer">
          This is an automated message. Please do not reply directly to this email.
        </div>
      </div>
    </div>
  </body>
</html>
`;
}

