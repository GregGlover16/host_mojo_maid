import { v4 as uuid } from 'uuid';
import { OutboxDal } from '../../dal/outbox.dal';
import { createTurnoJobSchema, vendorStatusWebhookSchema } from '../validation';
import type {
  ITurnoAdapter,
  CreateTurnoJobInput,
  VendorJobResult,
  VendorStatusWebhookPayload,
} from '../interfaces/cleaning-vendor';

/**
 * Stub Turno adapter. Writes an outbox row for each action
 * and returns a deterministic stub response.
 */
export class StubTurnoAdapter implements ITurnoAdapter {
  readonly vendorName = 'Turno' as const;

  constructor(private readonly outbox: OutboxDal) {}

  async createJob(input: CreateTurnoJobInput): Promise<VendorJobResult> {
    const parsed = createTurnoJobSchema.parse(input);
    const externalJobId = `stub-turno-${uuid().slice(0, 8)}`;

    await this.outbox.create({
      companyId: parsed.companyId,
      type: 'turno.create_job',
      payload: { ...parsed, externalJobId },
      idempotencyKey: `turno-create-${parsed.taskId}`,
    });

    return { externalJobId, status: 'accepted' };
  }

  async updateJob(
    companyId: string,
    externalJobId: string,
    updates: Partial<CreateTurnoJobInput>,
  ): Promise<VendorJobResult> {
    await this.outbox.create({
      companyId,
      type: 'turno.update_job',
      payload: { externalJobId, ...updates },
      idempotencyKey: `turno-update-${externalJobId}-${Date.now()}`,
    });

    return { externalJobId, status: 'accepted' };
  }

  async cancelJob(
    companyId: string,
    externalJobId: string,
  ): Promise<{ canceled: boolean }> {
    await this.outbox.create({
      companyId,
      type: 'turno.cancel_job',
      payload: { externalJobId },
      idempotencyKey: `turno-cancel-${externalJobId}`,
    });

    return { canceled: true };
  }

  async processStatusWebhook(
    payload: VendorStatusWebhookPayload,
  ): Promise<{ accepted: boolean }> {
    const parsed = vendorStatusWebhookSchema.parse(payload);

    await this.outbox.create({
      companyId: parsed.companyId,
      type: 'turno.status_webhook',
      payload: parsed as unknown as Record<string, unknown>,
      idempotencyKey: `turno-status-${parsed.externalJobId}-${parsed.event}`,
    });

    return { accepted: true };
  }
}
