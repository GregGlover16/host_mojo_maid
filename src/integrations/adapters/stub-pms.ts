import { v4 as uuid } from 'uuid';
import { OutboxDal } from '../../dal/outbox.dal';
import { pmsBookingWebhookSchema } from '../validation';
import type {
  IPmsAdapter,
  PmsReservation,
  PmsBookingWebhookPayload,
} from '../interfaces/pms';

/**
 * Stub PMS adapter. Returns canned reservation data and writes
 * inbound webhook events to the outbox for downstream processing.
 */
export class StubPmsAdapter implements IPmsAdapter {
  readonly pmsName = 'StubPMS';

  constructor(private readonly outbox: OutboxDal) {}

  async fetchReservations(
    _companyId: string,
    propertyExternalId: string,
    _fromDate: string,
    _toDate: string,
  ): Promise<PmsReservation[]> {
    return [
      {
        externalId: `stub-res-${uuid().slice(0, 8)}`,
        propertyExternalId,
        guestName: 'Stub Guest',
        checkIn: '2026-03-01',
        checkOut: '2026-03-05',
        guestCount: 2,
        status: 'booked',
      },
    ];
  }

  async processBookingWebhook(
    payload: PmsBookingWebhookPayload,
  ): Promise<{ accepted: boolean }> {
    const parsed = pmsBookingWebhookSchema.parse(payload);

    await this.outbox.create({
      companyId: parsed.companyId,
      type: 'pms.booking_webhook',
      payload: parsed as unknown as Record<string, unknown>,
      idempotencyKey: `pms-webhook-${parsed.reservation.externalId}-${parsed.event}`,
    });

    return { accepted: true };
  }
}
