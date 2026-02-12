import { logger } from '../config/logger';
import { prisma } from '../db/client';
import { CleaningTaskDal } from '../dal/cleaning-task.dal';
import { OutboxDal } from '../dal/outbox.dal';
import { EventsDal } from '../dal/events.dal';
import { startTimer } from '../telemetry/timing';
import { v4 as uuid } from 'uuid';

const taskDal = new CleaningTaskDal(prisma);
const outboxDal = new OutboxDal(prisma);
const eventsDal = new EventsDal(prisma);

export interface DispatchResult {
  success: boolean;
  taskId: string;
  cleanerId?: string;
  error?: string;
}

/**
 * Assigns the primary cleaner (priority=1) to a scheduled task
 * and queues a notification via the outbox.
 */
export async function dispatchTask(
  companyId: string,
  taskId: string,
  requestId?: string,
): Promise<DispatchResult> {
  const timer = startTimer('service.dispatchTask');

  try {
    const task = await taskDal.findById(companyId, taskId);
    if (!task) return { success: false, taskId, error: 'task_not_found' };
    if (task.status !== 'scheduled') {
      return { success: false, taskId, error: `invalid_status:${task.status}` };
    }

    // Find primary cleaner for the property
    const cleaner = await taskDal.findCleanerForProperty(companyId, task.propertyId, 1);
    if (!cleaner) {
      return { success: false, taskId, error: 'no_primary_cleaner' };
    }

    // Assign the cleaner
    const assigned = await taskDal.assignCleaner(companyId, taskId, cleaner.id);
    if (!assigned) {
      return { success: false, taskId, error: 'assign_failed' };
    }

    // Queue notification to cleaner
    await outboxDal.create({
      companyId,
      type: 'notify_cleaner',
      payload: {
        cleanerId: cleaner.id,
        cleanerName: cleaner.name,
        cleanerPhone: cleaner.phone,
        cleanerEmail: cleaner.email,
        taskId,
        propertyId: task.propertyId,
        scheduledStartAt: task.scheduledStartAt.toISOString(),
        scheduledEndAt: task.scheduledEndAt.toISOString(),
        action: 'assignment',
      },
      idempotencyKey: `dispatch-${taskId}-${cleaner.id}-${uuid().slice(0, 8)}`,
    });

    await logTaskEvent(companyId, taskId, 'task.assigned', requestId, {
      cleanerId: cleaner.id,
      cleanerName: cleaner.name,
    });

    return { success: true, taskId, cleanerId: cleaner.id };
  } finally {
    const durationMs = timer.stop();
    await logSpan(companyId, 'service.span', 'dispatchTask', durationMs, requestId, taskId);
  }
}

/**
 * Assigns a specific cleaner (used for backup dispatch during no-show).
 */
export async function dispatchToBackup(
  companyId: string,
  taskId: string,
  cleanerId: string,
  requestId?: string,
): Promise<DispatchResult> {
  const timer = startTimer('service.dispatchToBackup');

  try {
    const task = await taskDal.findById(companyId, taskId);
    if (!task) return { success: false, taskId, error: 'task_not_found' };

    // Task must be scheduled (unassigned after no-show reset)
    if (task.status !== 'scheduled') {
      return { success: false, taskId, error: `invalid_status:${task.status}` };
    }

    const assigned = await taskDal.assignCleaner(companyId, taskId, cleanerId);
    if (!assigned) {
      return { success: false, taskId, error: 'assign_failed' };
    }

    // Queue notification to backup cleaner
    await outboxDal.create({
      companyId,
      type: 'notify_cleaner',
      payload: {
        cleanerId,
        taskId,
        propertyId: task.propertyId,
        scheduledStartAt: task.scheduledStartAt.toISOString(),
        scheduledEndAt: task.scheduledEndAt.toISOString(),
        action: 'backup_assignment',
      },
      idempotencyKey: `backup-dispatch-${taskId}-${cleanerId}-${uuid().slice(0, 8)}`,
    });

    await logTaskEvent(companyId, taskId, 'task.backup_assigned', requestId, {
      cleanerId,
      reason: 'primary_no_show',
    });

    return { success: true, taskId, cleanerId };
  } finally {
    const durationMs = timer.stop();
    await logSpan(companyId, 'service.span', 'dispatchToBackup', durationMs, requestId, taskId);
  }
}

/**
 * Cleaner accepts the assignment. Records confirmedAt.
 */
export async function acceptTask(
  companyId: string,
  taskId: string,
  requestId?: string,
): Promise<{ success: boolean; error?: string }> {
  const timer = startTimer('service.acceptTask');

  try {
    const confirmed = await taskDal.confirmAssignment(companyId, taskId);
    if (!confirmed) {
      return { success: false, error: 'not_assigned_or_not_found' };
    }

    await logTaskEvent(companyId, taskId, 'task.confirmed', requestId, {
      cleanerId: confirmed.assignedCleanerId,
    });

    return { success: true };
  } finally {
    const durationMs = timer.stop();
    await logSpan(companyId, 'service.span', 'acceptTask', durationMs, requestId, taskId);
  }
}

/**
 * Cleaner checks in — transitions task to in_progress.
 */
export async function checkInTask(
  companyId: string,
  taskId: string,
  requestId?: string,
): Promise<{ success: boolean; error?: string }> {
  const timer = startTimer('service.checkInTask');

  try {
    const updated = await taskDal.transition(companyId, taskId, 'in_progress');
    if (!updated) {
      return { success: false, error: 'invalid_transition_or_not_found' };
    }

    await logTaskEvent(companyId, taskId, 'task.checked_in', requestId, {
      cleanerId: updated.assignedCleanerId,
    });

    return { success: true };
  } finally {
    const durationMs = timer.stop();
    await logSpan(companyId, 'service.span', 'checkInTask', durationMs, requestId, taskId);
  }
}

/**
 * Cleaner completes the task — transitions to completed + triggers payment flow.
 */
export async function completeTask(
  companyId: string,
  taskId: string,
  requestId?: string,
): Promise<{ success: boolean; error?: string }> {
  const timer = startTimer('service.completeTask');

  try {
    const updated = await taskDal.transition(companyId, taskId, 'completed');
    if (!updated) {
      return { success: false, error: 'invalid_transition_or_not_found' };
    }

    await logTaskEvent(companyId, taskId, 'task.completed', requestId, {
      cleanerId: updated.assignedCleanerId,
      completedAt: updated.completedAt?.toISOString(),
    });

    return { success: true };
  } finally {
    const durationMs = timer.stop();
    await logSpan(companyId, 'service.span', 'completeTask', durationMs, requestId, taskId);
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
      }),
      requestId,
      entityType: 'cleaning_task',
      entityId: taskId,
    });
  } catch (err) {
    logger.error({ err, type, taskId }, 'Failed to log dispatch event');
  }
}

async function logSpan(
  companyId: string,
  type: string,
  spanName: string,
  durationMs: number,
  requestId?: string,
  entityId?: string,
): Promise<void> {
  try {
    await eventsDal.create({
      companyId,
      type,
      payload: JSON.stringify({ spanName }),
      span: spanName,
      durationMs,
      requestId,
      entityType: entityId ? 'cleaning_task' : undefined,
      entityId,
    });
  } catch (err) {
    logger.error({ err, type, spanName }, 'Failed to log service span');
  }
}
