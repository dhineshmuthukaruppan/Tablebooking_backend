export interface BookingConfirmationEmailPayload {
  customerEmail?: string;
  adminEmail?: string | null;
  customerId?: string;
  customerName: string;
  bookingId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  guests: number;
  section: string;
  venueName: string;
  location: string;
}

