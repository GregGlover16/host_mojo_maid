import { logger } from '../config/logger';
import { prisma } from '../db/client';
import { CleaningTaskDal } from '../dal/cleaning-task.dal';
import { OutboxDal } from '../dal/outbox.dal';
import { EventsDal } from '../dal/events.dal';
import { startTimer } from '../telemetry/timing';
const taskDal = new CleaningTaskDal(prisma);
const outboxDal = new OutboxDal(prisma);
const eventsDal = new EventsDal(prisma);

export interface PaymentRequestResult {
  success: boolean;
  taskId: string;
  error?: string;
}

/**
 * Creates a payment request for a completed task.
 * Writes an outbox row for GHL/PMS to process.
 * Does NOT process the actual payment (that's Phase 4+).
 */
export async function requestPayment(
  companyId: string,
  taskId: string,
  requestId?: string,
): Promise<PaymentRequestResult> {
  const timer = startTimer('service.requestPayment');

  try {
    const task = await taskDal.findById(companyId, taskId);
    if (!task) return { success: false, taskId, error: 'task_not_found' };
    if (task.status !== 'completed') {
      return { success: false, taskId, error: `task_not_completed:${task.status}` };
    }
    if (task.paymentStatus !== 'none') {
      return { success: false, taskId, error: `payment_already_${task.paymentStatus}` };
    }
    if (!task.assignedCleanerId) {
      return { success: false, taskId, error: 'no_cleaner_assigned' };
    }
    if (task.paymentAmountCents <= 0) {
      return { success: false, taskId, error: 'no_payment_amount' };
    }

    // Mark payment as requested
    await taskDal.updatePaymentStatus(companyId, taskId, 'requested');

    // Queue payment request for GHL/PMS processing
    await outboxDal.create({
      companyId,
      type: 'payment_request',
      payload: {
        taskId,
        cleanerId: task.assignedCleanerId,
        propertyId: task.propertyId,
        amountCents: task.paymentAmountCents,
        currency: 'USD',
        description: `Cleaning task ${taskId}`,
      },
      idempotencyKey: `payment-${taskId}`,
    });

    await logEvent(companyId, taskId, 'payment.requested', requestId, {
      cleanerId: task.assignedCleanerId,
      amountCents: task.paymentAmountCents,
    });

    return { success: true, taskId };
  } finally {
    timer.stop();
  }
}

async function logEvent(
  companyId: string,
  taskId: string,
  type: string,
  requestId?: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  try {
    await eventsDal.create({
      companyId,
      type,
      payload: JSON.stringify({
        taskId,
        ...payload,
        ...(requestId ? { requestId } : {}),
      }),
      entityType: 'cleaning_task',
      entityId: taskId,
    });
  } catch (err) {
    logger.error({ err, type, taskId }, 'Failed to log payment event');
  }
}
