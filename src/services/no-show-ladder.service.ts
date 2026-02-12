import { logger } from '../config/logger';
import { prisma } from '../db/client';
import { CleaningTaskDal } from '../dal/cleaning-task.dal';
import { IncidentDal } from '../dal/incident.dal';
import { OutboxDal } from '../dal/outbox.dal';
import { EventsDal } from '../dal/events.dal';
import { triageConfig } from '../config/triage';
import { dispatchToBackup } from './dispatch.service';
import { requestEmergencyCleaning } from './emergency.service';
import { startTimer } from '../telemetry/timing';
const taskDal = new CleaningTaskDal(prisma);
const incidentDal = new IncidentDal(prisma);
const outboxDal = new OutboxDal(prisma);
const eventsDal = new EventsDal(prisma);

export type LadderStep = 'remind_primary' | 'switch_backup' | 'emergency_request' | 'host_manual';

export interface LadderStepResult {
  taskId: string;
  step: LadderStep;
  success: boolean;
  detail?: string;
}

export interface LadderRunResult {
  evaluated: number;
  actions: LadderStepResult[];
}

/**
 * No-show escalation ladder.
 *
 * For every assigned task past its scheduled start, determine how late it is
 * and take the highest-applicable ladder step that hasn't been done yet.
 *
 * Timeline (minutes past scheduledStartAt):
 *   T+10  -> remind primary cleaner
 *   T+20  -> switch to backup cleaner
 *   T+40  -> fire emergency marketplace request
 *   T+60  -> host manual intervention (runbook link)
 *
 * Each step logs a telemetry event so the ladder is idempotent --
 * we skip steps whose events already exist for the task.
 */
export async function runNoShowLadder(requestId?: string): Promise<LadderRunResult> {
  const timer = startTimer('service.runNoShowLadder');

  try {
    const now = Date.now();

    // Find tasks that are assigned (not confirmed) and past their scheduled start
    // Uses DAL method instead of prisma directly for consistent layering
    const candidates = await taskDal.findLadderCandidates(new Date(now));

    const result: LadderRunResult = { evaluated: candidates.length, actions: [] };

    for (const task of candidates) {
      const minutesLate = (now - task.scheduledStartAt.getTime()) / 60_000;

      // Check which events have already been logged for this task (via DAL)
      const pastEvents = await eventsDal.findLadderEventsForTask(task.id);
      const doneSteps = new Set(pastEvents.map((e) => e.type));

      // Walk the ladder from highest step down to lowest so we do the most
      // important action first. Each step is independent.

      if (
        minutesLate >= triageConfig.LADDER_HOST_MANUAL_MINUTES &&
        !doneSteps.has('ladder.host_manual')
      ) {
        const stepResult = await stepHostManual(task, requestId);
        result.actions.push(stepResult);
      } else if (
        minutesLate >= triageConfig.LADDER_EMERGENCY_REQUEST_MINUTES &&
        !doneSteps.has('ladder.emergency_request')
      ) {
        const stepResult = await stepEmergencyRequest(task, requestId);
        result.actions.push(stepResult);
      } else if (
        minutesLate >= triageConfig.LADDER_SWITCH_BACKUP_MINUTES &&
        !doneSteps.has('ladder.switch_backup')
      ) {
        const stepResult = await stepSwitchBackup(task, requestId);
        result.actions.push(stepResult);
      } else if (
        minutesLate >= triageConfig.LADDER_REMIND_PRIMARY_MINUTES &&
        !doneSteps.has('ladder.remind_primary')
      ) {
        const stepResult = await stepRemindPrimary(task, requestId);
        result.actions.push(stepResult);
      }
    }

    return result;
  } finally {
    timer.stop();
  }
}

// -- Step implementations --

async function stepRemindPrimary(
  task: { id: string; companyId: string; propertyId: string; assignedCleanerId: string | null },
  requestId?: string,
): Promise<LadderStepResult> {
  try {
    await outboxDal.create({
      companyId: task.companyId,
      type: 'notify_cleaner',
      payload: {
        cleanerId: task.assignedCleanerId,
        taskId: task.id,
        propertyId: task.propertyId,
        action: 'reminder',
        message: 'You have not confirmed your cleaning assignment. Please check in now.',
      },
      idempotencyKey: `ladder-remind-${task.id}`,
    });

    await logLadderEvent(task.companyId, task.id, 'ladder.remind_primary', requestId);

    return { taskId: task.id, step: 'remind_primary', success: true };
  } catch (err) {
    logger.error({ err, taskId: task.id }, 'Ladder: remind_primary failed');
    return { taskId: task.id, step: 'remind_primary', success: false, detail: 'error' };
  }
}

async function stepSwitchBackup(
  task: { id: string; companyId: string; propertyId: string; assignedCleanerId: string | null },
  requestId?: string,
): Promise<LadderStepResult> {
  try {
    // Create NO_SHOW incident
    await incidentDal.create({
      companyId: task.companyId,
      propertyId: task.propertyId,
      taskId: task.id,
      type: 'NO_SHOW',
      severity: 'med',
      description: `Primary cleaner (${task.assignedCleanerId}) did not confirm within ${triageConfig.LADDER_SWITCH_BACKUP_MINUTES} minutes of scheduled start. Switching to backup.`,
    });

    // Unassign primary
    await taskDal.unassign(task.companyId, task.id);

    // Find backup
    const backup = await taskDal.findCleanerForProperty(task.companyId, task.propertyId, 2);
    if (backup) {
      const dispatched = await dispatchToBackup(task.companyId, task.id, backup.id, requestId);
      if (dispatched.success) {
        await outboxDal.create({
          companyId: task.companyId,
          type: 'notify_host',
          payload: {
            taskId: task.id,
            propertyId: task.propertyId,
            event: 'backup_cleaner_assigned',
            backupCleanerId: backup.id,
          },
          idempotencyKey: `ladder-backup-notify-${task.id}`,
        });

        await logLadderEvent(task.companyId, task.id, 'ladder.switch_backup', requestId, {
          backupCleanerId: backup.id,
        });

        return {
          taskId: task.id,
          step: 'switch_backup',
          success: true,
          detail: `backup_assigned:${backup.id}`,
        };
      }
    }

    // No backup available -- still mark the step done so we escalate next run
    await logLadderEvent(task.companyId, task.id, 'ladder.switch_backup', requestId, {
      result: 'no_backup',
    });

    return { taskId: task.id, step: 'switch_backup', success: false, detail: 'no_backup' };
  } catch (err) {
    logger.error({ err, taskId: task.id }, 'Ladder: switch_backup failed');
    return { taskId: task.id, step: 'switch_backup', success: false, detail: 'error' };
  }
}

async function stepEmergencyRequest(
  task: { id: string; companyId: string; propertyId: string },
  requestId?: string,
): Promise<LadderStepResult> {
  try {
    const result = await requestEmergencyCleaning(
      {
        companyId: task.companyId,
        propertyId: task.propertyId,
        neededBy: new Date(Date.now() + 2 * 60 * 60_000).toISOString(), // needed within 2 hours
        reason: 'No-show ladder escalation: primary and backup cleaners unavailable.',
      },
      requestId,
    );

    await logLadderEvent(task.companyId, task.id, 'ladder.emergency_request', requestId, {
      emergencyResult: result.success,
    });

    return {
      taskId: task.id,
      step: 'emergency_request',
      success: result.success,
      detail: result.success ? `incident:${result.incidentId}` : result.error,
    };
  } catch (err) {
    logger.error({ err, taskId: task.id }, 'Ladder: emergency_request failed');
    return { taskId: task.id, step: 'emergency_request', success: false, detail: 'error' };
  }
}

async function stepHostManual(
  task: { id: string; companyId: string; propertyId: string },
  requestId?: string,
): Promise<LadderStepResult> {
  try {
    await incidentDal.create({
      companyId: task.companyId,
      propertyId: task.propertyId,
      taskId: task.id,
      type: 'OTHER',
      severity: 'high',
      description:
        'All automated escalation steps exhausted. Host must arrange cleaning manually. See RUNBOOK_NO_SHOW.md.',
    });

    await outboxDal.create({
      companyId: task.companyId,
      type: 'notify_host',
      payload: {
        taskId: task.id,
        propertyId: task.propertyId,
        event: 'manual_intervention_needed',
        message:
          'All cleaning options exhausted. Please arrange cleaning manually. Runbook: /docs/RUNBOOK_NO_SHOW.md',
      },
      idempotencyKey: `ladder-manual-${task.id}`,
    });

    await logLadderEvent(task.companyId, task.id, 'ladder.host_manual', requestId);

    return { taskId: task.id, step: 'host_manual', success: true };
  } catch (err) {
    logger.error({ err, taskId: task.id }, 'Ladder: host_manual failed');
    return { taskId: task.id, step: 'host_manual', success: false, detail: 'error' };
  }
}

async function logLadderEvent(
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
    logger.error({ err, type, taskId }, 'Failed to log ladder event');
  }
}
