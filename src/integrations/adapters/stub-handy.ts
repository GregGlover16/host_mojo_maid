import { v4 as uuid } from 'uuid';
import { OutboxDal } from '../../dal/outbox.dal';
import { emergencyCleaningRequestSchema } from '../validation';
import type {
  IHandyAdapter,
  EmergencyCleaningRequest,
  VendorJobResult,
} from '../interfaces/cleaning-vendor';

/**
 * Stub Handy adapter. Writes an outbox row for emergency cleaning requests
 * and returns a deterministic stub response.
 */
export class StubHandyAdapter implements IHandyAdapter {
  readonly vendorName = 'Handy' as const;

  constructor(private readonly outbox: OutboxDal) {}

  async requestEmergencyCleaning(
    input: EmergencyCleaningRequest,
  ): Promise<VendorJobResult> {
    const parsed = emergencyCleaningRequestSchema.parse(input);
    const externalJobId = `stub-handy-${uuid().slice(0, 8)}`;

    await this.outbox.create({
      companyId: parsed.companyId,
      type: 'handy.emergency_request',
      payload: { ...parsed, externalJobId },
      idempotencyKey: `handy-emergency-${parsed.taskId}`,
    });

    return { externalJobId, status: 'pending' };
  }

  async getConfirmation(
    companyId: string,
    externalJobId: string,
  ): Promise<{ confirmed: boolean; eta?: string }> {
    await this.outbox.create({
      companyId,
      type: 'handy.get_confirmation',
      payload: { externalJobId },
      idempotencyKey: `handy-confirm-${externalJobId}-${Date.now()}`,
    });

    return { confirmed: true, eta: '14:30' };
  }
}
