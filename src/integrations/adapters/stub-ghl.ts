import { v4 as uuid } from 'uuid';
import { OutboxDal } from '../../dal/outbox.dal';
import { paymentRequestSchema, workflowTriggerSchema } from '../validation';
import type {
  IGhlAdapter,
  PaymentRequestInput,
  PaymentRequestResult,
  WorkflowTriggerInput,
  WorkflowTriggerResult,
} from '../interfaces/ghl';

/**
 * Stub GHL adapter. Writes outbox rows for payment requests
 * and workflow triggers. Does NOT process payments.
 */
export class StubGhlAdapter implements IGhlAdapter {
  readonly platformName = 'GHL' as const;

  constructor(private readonly outbox: OutboxDal) {}

  async requestPayment(input: PaymentRequestInput): Promise<PaymentRequestResult> {
    const parsed = paymentRequestSchema.parse(input);
    const externalPaymentId = `stub-pay-${uuid().slice(0, 8)}`;

    await this.outbox.create({
      companyId: parsed.companyId,
      type: 'ghl.payment_request',
      payload: { ...parsed, externalPaymentId },
      idempotencyKey: `ghl-pay-${parsed.taskId}-${parsed.cleanerId}`,
    });

    return { externalPaymentId, status: 'requested' };
  }

  async triggerWorkflow(input: WorkflowTriggerInput): Promise<WorkflowTriggerResult> {
    const parsed = workflowTriggerSchema.parse(input);
    const externalTriggerId = `stub-wf-${uuid().slice(0, 8)}`;

    await this.outbox.create({
      companyId: parsed.companyId,
      type: 'ghl.workflow_trigger',
      payload: { ...parsed, externalTriggerId },
      idempotencyKey: `ghl-wf-${parsed.workflowId}-${parsed.contactId}`,
    });

    return { externalTriggerId, status: 'triggered' };
  }
}
