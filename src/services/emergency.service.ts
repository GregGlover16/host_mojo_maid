import { logger } from '../config/logger';
import { prisma } from '../db/client';
import { CleaningTaskDal } from '../dal/cleaning-task.dal';
import { IncidentDal } from '../dal/incident.dal';
import { OutboxDal } from '../dal/outbox.dal';
import { EventsDal } from '../dal/events.dal';
import { startTimer } from '../telemetry/timing';
const taskDal = new CleaningTaskDal(prisma);
const incidentDal = new IncidentDal(prisma);
const outboxDal = new OutboxDal(prisma);
const eventsDal = new EventsDal(prisma);

export interface EmergencyRequestInput {
  companyId: string;
  propertyId: string;
  neededBy: string; // ISO datetime
  reason: string;
}

export interface EmergencyRequestResult {
  success: boolean;
  incidentId?: string;
  outboxId?: string;
  error?: string;
}

/**
 * Creates an emergency cleaning request.
 * 1. Creates a high-severity incident
 * 2. Writes an EMERGENCY_CLEAN_REQUEST outbox row (for Handy/Turno marketplace)
 * 3. Writes a notify_host outbox row
 * 4. Logs a telemetry event
 */
export async function requestEmergencyCleaning(
  input: EmergencyRequestInput,
  requestId?: string,
): Promise<EmergencyRequestResult> {
  const timer = startTimer('service.requestEmergencyCleaning');

  try {
    // Find the next active task for this property via DAL
    const nextTask = await taskDal.findNextActive(input.companyId, input.propertyId);

    // If no active task, create a standalone cleaning task for the emergency
    let taskId: string;
    if (nextTask) {
      taskId = nextTask.id;
    } else {
      const neededByDate = new Date(input.neededBy);
      const endDate = new Date(neededByDate);
      endDate.setUTCMinutes(endDate.getUTCMinutes() + 120); // 2-hour window

      const emergencyTask = await taskDal.create({
        companyId: input.companyId,
        propertyId: input.propertyId,
        scheduledStartAt: neededByDate,
        scheduledEndAt: endDate,
        status: 'scheduled',
        vendor: 'handy',
      });
      taskId = emergencyTask.id;
    }

    // 1. Create high-severity incident
    const incident = await incidentDal.create({
      companyId: input.companyId,
      propertyId: input.propertyId,
      taskId,
      type: 'OTHER',
      severity: 'high',
      description: `Emergency cleaning requested. Reason: ${input.reason}. Needed by: ${input.neededBy}.`,
    });

    // 2. Outbox: emergency clean request (Handy/Turno marketplace)
    const outboxRow = await outboxDal.create({
      companyId: input.companyId,
      type: 'emergency_clean_request',
      payload: {
        propertyId: input.propertyId,
        taskId,
        neededBy: input.neededBy,
        reason: input.reason,
      },
      idempotencyKey: `emergency-clean-${input.propertyId}-${taskId}`,
    });

    // 3. Notify host
    await outboxDal.create({
      companyId: input.companyId,
      type: 'notify_host',
      payload: {
        propertyId: input.propertyId,
        taskId,
        event: 'emergency_clean_requested',
        reason: input.reason,
        neededBy: input.neededBy,
      },
      idempotencyKey: `host-notify-emergency-${input.propertyId}-${taskId}`,
    });

    // 4. Telemetry
    await logEvent(input.companyId, taskId, 'emergency.clean_requested', requestId, {
      propertyId: input.propertyId,
      reason: input.reason,
      neededBy: input.neededBy,
    });

    return { success: true, incidentId: incident.id, outboxId: outboxRow.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    logger.error({ err, companyId: input.companyId }, 'Emergency cleaning request failed');
    return { success: false, error: message };
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
    });
  } catch (err) {
    logger.error({ err, type, taskId }, 'Failed to log emergency event');
  }
}
