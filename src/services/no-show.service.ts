import { logger } from '../config/logger';
import { prisma } from '../db/client';
import { CleaningTaskDal } from '../dal/cleaning-task.dal';
import { IncidentDal } from '../dal/incident.dal';
import { OutboxDal } from '../dal/outbox.dal';
import { EventsDal } from '../dal/events.dal';
import { triageConfig } from '../config/triage';
import { dispatchToBackup } from './dispatch.service';
import { startTimer } from '../telemetry/timing';
const taskDal = new CleaningTaskDal(prisma);
const incidentDal = new IncidentDal(prisma);
const outboxDal = new OutboxDal(prisma);
const eventsDal = new EventsDal(prisma);

export interface NoShowCheckResult {
  checked: number;
  noShows: number;
  backupAssigned: number;
  manualNeeded: number;
}

/**
 * Scans for assigned tasks that are past the confirm deadline.
 *
 * For each no-show:
 *   1. Create NO_SHOW incident (severity=med)
 *   2. Un-assign the primary cleaner
 *   3. If backup cleaner exists (priority=2) → dispatch to backup + notify
 *   4. If no backup → create OTHER incident (severity=high) + alert host
 */
export async function checkForNoShows(requestId?: string): Promise<NoShowCheckResult> {
  const timer = startTimer('service.checkForNoShows');

  try {
    // Deadline = now - CONFIRM_TIMEOUT_MINUTES
    // Tasks assigned before this time without confirmation are no-shows
    const deadline = new Date(
      Date.now() - triageConfig.CONFIRM_TIMEOUT_MINUTES * 60_000,
    );

    const unconfirmed = await taskDal.findUnconfirmedPastDeadline(deadline);

    const result: NoShowCheckResult = {
      checked: unconfirmed.length,
      noShows: 0,
      backupAssigned: 0,
      manualNeeded: 0,
    };

    for (const task of unconfirmed) {
      result.noShows++;

      // 1. Log NO_SHOW incident
      await incidentDal.create({
        companyId: task.companyId,
        propertyId: task.propertyId,
        taskId: task.id,
        type: 'NO_SHOW',
        severity: 'med',
        description: `Primary cleaner (${task.assignedCleanerId}) did not confirm within ${triageConfig.CONFIRM_TIMEOUT_MINUTES} minutes.`,
      });

      await logEvent(task.companyId, task.id, 'incident.no_show', requestId, {
        cleanerId: task.assignedCleanerId,
      });

      // 2. Un-assign the primary cleaner (back to 'scheduled')
      await taskDal.unassign(task.companyId, task.id);

      // 3. Try backup cleaner (priority=2)
      const backup = await taskDal.findCleanerForProperty(
        task.companyId,
        task.propertyId,
        2,
      );

      if (backup) {
        const dispatched = await dispatchToBackup(
          task.companyId,
          task.id,
          backup.id,
          requestId,
        );

        if (dispatched.success) {
          result.backupAssigned++;

          // Notify host about the swap
          await outboxDal.create({
            companyId: task.companyId,
            type: 'notify_host',
            payload: {
              taskId: task.id,
              propertyId: task.propertyId,
              event: 'backup_cleaner_assigned',
              backupCleanerId: backup.id,
              // backupCleanerName resolved at delivery time (no PII in outbox)
            },
            idempotencyKey: `host-notify-backup-${task.id}`,
          });
          continue;
        }
      }

      // 4. No backup — manual intervention needed
      result.manualNeeded++;

      await incidentDal.create({
        companyId: task.companyId,
        propertyId: task.propertyId,
        taskId: task.id,
        type: 'OTHER',
        severity: 'high',
        description: 'No backup cleaner available. Manual intervention required.',
      });

      await outboxDal.create({
        companyId: task.companyId,
        type: 'notify_host',
        payload: {
          taskId: task.id,
          propertyId: task.propertyId,
          event: 'manual_intervention_needed',
          message:
            'Primary cleaner no-show and no backup available. Please arrange cleaning manually.',
        },
        idempotencyKey: `host-notify-manual-${task.id}`,
      });

      await logEvent(task.companyId, task.id, 'incident.manual_needed', requestId, {
        reason: 'no_backup_cleaner',
      });
    }

    return result;
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
    logger.error({ err, type, taskId }, 'Failed to log no-show event');
  }
}
