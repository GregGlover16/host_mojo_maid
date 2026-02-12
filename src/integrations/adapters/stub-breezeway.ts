import { v4 as uuid } from 'uuid';
import { OutboxDal } from '../../dal/outbox.dal';
import { createBreezewayTaskSchema, vendorStatusWebhookSchema } from '../validation';
import type {
  IBreezewayAdapter,
  CreateBreezewayTaskInput,
  VendorJobResult,
  VendorStatusWebhookPayload,
} from '../interfaces/cleaning-vendor';

/**
 * Stub Breezeway adapter. Writes an outbox row for each action
 * and returns a deterministic stub response.
 */
export class StubBreezewayAdapter implements IBreezewayAdapter {
  readonly vendorName = 'Breezeway' as const;

  constructor(private readonly outbox: OutboxDal) {}

  async createTask(input: CreateBreezewayTaskInput): Promise<VendorJobResult> {
    const parsed = createBreezewayTaskSchema.parse(input);
    const externalJobId = `stub-bw-${uuid().slice(0, 8)}`;

    await this.outbox.create({
      companyId: parsed.companyId,
      type: 'breezeway.create_task',
      payload: { ...parsed, externalJobId },
      idempotencyKey: `bw-create-${parsed.taskId}`,
    });

    return { externalJobId, status: 'accepted' };
  }

  async updateTask(
    companyId: string,
    externalTaskId: string,
    updates: Partial<CreateBreezewayTaskInput>,
  ): Promise<VendorJobResult> {
    await this.outbox.create({
      companyId,
      type: 'breezeway.update_task',
      payload: { externalTaskId, ...updates },
      idempotencyKey: `bw-update-${externalTaskId}-${Date.now()}`,
    });

    return { externalJobId: externalTaskId, status: 'accepted' };
  }

  async syncStatus(
    companyId: string,
    externalTaskId: string,
  ): Promise<{ status: string }> {
    await this.outbox.create({
      companyId,
      type: 'breezeway.sync_status',
      payload: { externalTaskId },
      idempotencyKey: `bw-sync-${externalTaskId}-${Date.now()}`,
    });

    return { status: 'in_progress' };
  }

  async processStatusWebhook(
    payload: VendorStatusWebhookPayload,
  ): Promise<{ accepted: boolean }> {
    const parsed = vendorStatusWebhookSchema.parse(payload);

    await this.outbox.create({
      companyId: parsed.companyId,
      type: 'breezeway.status_webhook',
      payload: parsed as unknown as Record<string, unknown>,
      idempotencyKey: `bw-status-${parsed.externalJobId}-${parsed.event}`,
    });

    return { accepted: true };
  }
}
