import { v4 as uuid } from 'uuid';
import { OutboxDal } from '../../dal/outbox.dal';
import { sendNotificationSchema } from '../validation';
import type {
  INotificationAdapter,
  SendNotificationInput,
  NotificationResult,
} from '../interfaces/notification';

/**
 * Stub notification adapter. Writes an outbox row for each notification
 * and returns a deterministic stub result.
 */
export class StubNotificationAdapter implements INotificationAdapter {
  readonly adapterName = 'StubNotification';

  constructor(private readonly outbox: OutboxDal) {}

  async send(input: SendNotificationInput): Promise<NotificationResult> {
    const parsed = sendNotificationSchema.parse(input);
    const externalMessageId = `stub-msg-${uuid().slice(0, 8)}`;

    await this.outbox.create({
      companyId: parsed.companyId,
      type: `notification.${parsed.channel}`,
      payload: { ...parsed, externalMessageId },
      idempotencyKey: `notif-${parsed.channel}-${parsed.recipientId}-${Date.now()}`,
    });

    return { externalMessageId, status: 'queued' };
  }
}
