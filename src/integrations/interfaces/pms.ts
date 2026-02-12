/**
 * Interface for Property Management System (PMS) integrations.
 * The PMS is the source of truth for reservations and property data.
 *
 * Phase 2: Expanded to support webhook-driven reservation ingest.
 */

// A reservation as received from the PMS.
export interface PmsReservation {
  externalId: string;
  propertyExternalId: string;
  guestName: string;
  checkIn: string; // ISO YYYY-MM-DD
  checkOut: string; // ISO YYYY-MM-DD
  guestCount: number;
  status: 'booked' | 'canceled' | 'modified';
}

// Webhook payload when a booking changes in the PMS.
export interface PmsBookingWebhookPayload {
  companyId: string;
  event: 'booking.created' | 'booking.modified' | 'booking.canceled';
  reservation: PmsReservation;
  receivedAt: string; // ISO timestamp
  signatureHeader: string; // e.g. X-PMS-Signature value
}

export interface IPmsAdapter {
  /** Human-readable name of this PMS (e.g. "Guesty", "Hospitable") */
  readonly pmsName: string;

  /** Fetch reservations for a property within a date range */
  fetchReservations(
    companyId: string,
    propertyExternalId: string,
    fromDate: string,
    toDate: string,
  ): Promise<PmsReservation[]>;

  /** Process an inbound booking webhook (validate + write outbox row) */
  processBookingWebhook(payload: PmsBookingWebhookPayload): Promise<{ accepted: boolean }>;
}
