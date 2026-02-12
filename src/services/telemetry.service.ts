import { logger } from '../config/logger';
import { prisma } from '../db/client';
import { EventsDal } from '../dal/events.dal';

const eventsDal = new EventsDal(prisma);

export interface LogEventInput {
  companyId?: string;
  type: string;
  payload?: Record<string, unknown>;
  requestId?: string;
  span?: string;
  durationMs?: number;
  entityType?: string;
  entityId?: string;
}

/**
 * Service layer for telemetry events.
 * Business logic lives here; DB access is delegated to the DAL.
 *
 * Supports enriched events with requestId, span labels, duration, and entity refs.
 * Never throws — if the write fails, logs the error and returns null.
 */
export async function logEvent(input: LogEventInput): Promise<string | null> {
  try {
    const event = await eventsDal.create({
      companyId: input.companyId ?? null,
      type: input.type,
      payload: JSON.stringify(input.payload ?? {}),
      requestId: input.requestId,
      span: input.span,
      durationMs: input.durationMs,
      entityType: input.entityType,
      entityId: input.entityId,
    });

    logger.debug({ eventId: event.id, type: input.type }, 'Telemetry event recorded');
    return event.id;
  } catch (err) {
    logger.error({ err, eventType: input.type }, 'Failed to write telemetry event');
    return null;
  }
}
