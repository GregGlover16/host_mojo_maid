import { logger } from '../config/logger';
import { prisma } from '../db/client';
import { CleaningTaskDal } from '../dal/cleaning-task.dal';
import { EventsDal } from '../dal/events.dal';
import { startTimer } from '../telemetry/timing';

const taskDal = new CleaningTaskDal(prisma);
const eventsDal = new EventsDal(prisma);

export interface BookingEventInput {
  companyId: string;
  bookingId: string;
  propertyId: string;
  /** Booking end time = checkout = when cleaning should start. */
  endAt: Date;
  /** Cleaning duration to derive scheduledEndAt. */
  cleaningDurationMinutes: number;
  status: 'booked' | 'canceled';
  requestId?: string;
}

export interface BookingHandlerResult {
  action: 'created' | 'canceled' | 'rescheduled' | 'no_op';
  taskId?: string;
}

/**
 * Handles booking.created / booking.updated events.
 * Deterministic logic:
 *   - If booking is canceled → cancel the linked cleaning task.
 *   - If no task exists → create one at checkout time.
 *   - If task exists but endAt changed → reschedule.
 */
export async function handleBookingEvent(
  input: BookingEventInput,
): Promise<BookingHandlerResult> {
  const timer = startTimer('service.bookingHandler');

  try {
    // If the booking was canceled, cancel any linked task
    if (input.status === 'canceled') {
      const existing = await taskDal.findByBookingId(input.companyId, input.bookingId);
      if (existing) {
        const canceled = await taskDal.transition(input.companyId, existing.id, 'canceled');
        if (canceled) {
          await logTaskEvent(input.companyId, canceled.id, 'task.canceled', input.requestId, {
            reason: 'booking_canceled',
            bookingId: input.bookingId,
          });
          return { action: 'canceled', taskId: canceled.id };
        }
      }
      return { action: 'no_op' };
    }

    // Booking is active — ensure a cleaning task exists
    const scheduledStartAt = input.endAt;
    const scheduledEndAt = new Date(
      input.endAt.getTime() + input.cleaningDurationMinutes * 60_000,
    );

    const existing = await taskDal.findByBookingId(input.companyId, input.bookingId);

    if (existing) {
      // Check if times changed (booking extension)
      const startChanged =
        existing.scheduledStartAt.getTime() !== scheduledStartAt.getTime();
      if (startChanged) {
        const rescheduled = await taskDal.reschedule(
          input.companyId,
          existing.id,
          scheduledStartAt,
          scheduledEndAt,
        );
        if (rescheduled) {
          await logTaskEvent(input.companyId, rescheduled.id, 'task.rescheduled', input.requestId, {
            bookingId: input.bookingId,
            oldStartAt: existing.scheduledStartAt.toISOString(),
            newStartAt: scheduledStartAt.toISOString(),
          });
          return { action: 'rescheduled', taskId: rescheduled.id };
        }
      }
      return { action: 'no_op' };
    }

    // No existing task — create one
    const task = await taskDal.create({
      companyId: input.companyId,
      propertyId: input.propertyId,
      bookingId: input.bookingId,
      scheduledStartAt,
      scheduledEndAt,
    });

    await logTaskEvent(input.companyId, task.id, 'task.created', input.requestId, {
      bookingId: input.bookingId,
      propertyId: input.propertyId,
    });

    return { action: 'created', taskId: task.id };
  } finally {
    timer.stop();
  }
}

async function logTaskEvent(
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
    logger.error({ err, type, taskId }, 'Failed to log task event');
  }
}
