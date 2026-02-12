import { prisma } from '../db/client';
import { logger } from '../config/logger';

export interface LogEventInput {
  companyId?: string;
  type: string;
  payload?: Record<string, unknown>;
}

/**
 * Write a structured telemetry event to the events table.
 * This is the single entry point for all telemetry — never write to the
 * events table directly from other modules.
 *
 * Designed to never throw: if the write fails, it logs the error and
 * returns null instead of crashing the caller.
 */
export async function logEvent(input: LogEventInput): Promise<string | null> {
  try {
    const event = await prisma.event.create({
      data: {
        companyId: input.companyId ?? null,
        type: input.type,
        payload: JSON.stringify(input.payload ?? {}),
      },
    });

    logger.debug({ eventId: event.id, type: input.type }, 'Telemetry event recorded');
    return event.id;
  } catch (err) {
    // Never throw from telemetry — log and return null
    logger.error({ err, eventType: input.type }, 'Failed to write telemetry event');
    return null;
  }
}
