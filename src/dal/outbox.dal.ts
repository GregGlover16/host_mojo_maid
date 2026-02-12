import { PrismaClient } from '@prisma/client';

export interface CreateOutboxInput {
  companyId: string;
  type: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

/**
 * Data Access Layer for the outbox table.
 * Every external side-effect (vendor call, notification, payment request)
 * is written here as a pending row. A background worker picks them up later.
 */
export class OutboxDal {
  constructor(private readonly db: PrismaClient) {}

  async create(input: CreateOutboxInput) {
    return this.db.outbox.create({
      data: {
        companyId: input.companyId,
        type: input.type,
        payloadJson: JSON.stringify(input.payload),
        idempotencyKey: input.idempotencyKey,
        status: 'pending',
        attempts: 0,
      },
    });
  }

  async findByIdempotencyKey(key: string) {
    return this.db.outbox.findUnique({
      where: { idempotencyKey: key },
    });
  }

  async findPending(limit = 50) {
    return this.db.outbox.findMany({
      where: {
        status: 'pending',
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async markSent(id: string) {
    return this.db.outbox.update({
      where: { id },
      data: { status: 'sent' },
    });
  }

  async markFailed(id: string, nextAttemptAt: Date) {
    return this.db.outbox.update({
      where: { id },
      data: {
        status: 'failed',
        attempts: { increment: 1 },
        nextAttemptAt,
      },
    });
  }
}
