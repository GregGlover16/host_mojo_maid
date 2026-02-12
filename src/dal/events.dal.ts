import { PrismaClient } from '@prisma/client';

/**
 * Data Access Layer for the events table.
 * Accepts a PrismaClient (or transaction) so it can be tested with isolated DBs.
 */
export class EventsDal {
  constructor(private readonly db: PrismaClient) {}

  async create(data: {
    companyId?: string | null;
    type: string;
    payload: string;
    requestId?: string;
    span?: string;
    durationMs?: number;
    entityType?: string;
    entityId?: string;
  }) {
    return this.db.event.create({ data });
  }

  async findByType(type: string, limit = 100) {
    return this.db.event.findMany({
      where: { type },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findByCompany(companyId: string, limit = 100) {
    return this.db.event.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findByRequestId(requestId: string) {
    return this.db.event.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Returns all events that have a durationMs value, sorted ascending. */
  async findWithDuration(limit = 10_000) {
    return this.db.event.findMany({
      where: { durationMs: { not: null } },
      orderBy: { durationMs: 'asc' },
      select: { type: true, durationMs: true, createdAt: true },
      take: limit,
    });
  }

  /** Find ladder events for a specific task (used by no-show ladder idempotency). */
  async findLadderEventsForTask(taskId: string) {
    return this.db.event.findMany({
      where: {
        entityType: 'cleaning_task',
        entityId: taskId,
        type: { startsWith: 'ladder.' },
      },
    });
  }

  async findRecent(limit = 100) {
    return this.db.event.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
