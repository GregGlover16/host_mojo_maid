import { PrismaClient } from '@prisma/client';

// Valid state transitions for the cleaning task state machine.
// Key = current status, Value = set of allowed next statuses.
const VALID_TRANSITIONS: Record<string, Set<string>> = {
  scheduled: new Set(['assigned', 'canceled']),
  assigned: new Set(['in_progress', 'canceled', 'failed', 'scheduled']),
  in_progress: new Set(['completed', 'failed']),
  // Terminal states — no further transitions
  completed: new Set(),
  canceled: new Set(),
  failed: new Set(),
};

export function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.has(to) ?? false;
}

export interface CreateCleaningTaskInput {
  companyId: string;
  propertyId: string;
  bookingId?: string;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  assignedCleanerId?: string;
  status?: string;
  vendor?: string;
}

export interface ListCleaningTasksInput {
  companyId: string;
  propertyId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  status?: string;
}

/**
 * Data Access Layer for cleaning tasks.
 * All queries are scoped by companyId (multi-tenant isolation).
 */
export class CleaningTaskDal {
  constructor(private readonly db: PrismaClient) {}

  async create(input: CreateCleaningTaskInput) {
    return this.db.cleaningTask.create({
      data: {
        companyId: input.companyId,
        propertyId: input.propertyId,
        bookingId: input.bookingId,
        scheduledStartAt: input.scheduledStartAt,
        scheduledEndAt: input.scheduledEndAt,
        assignedCleanerId: input.assignedCleanerId,
        status: input.status ?? 'scheduled',
        ...(input.vendor ? { vendor: input.vendor } : {}),
      },
    });
  }

  async findById(companyId: string, taskId: string) {
    return this.db.cleaningTask.findFirst({
      where: { id: taskId, companyId },
    });
  }

  /** Find next active (scheduled/assigned/in_progress) task for a property. */
  async findNextActive(companyId: string, propertyId: string) {
    return this.db.cleaningTask.findFirst({
      where: {
        companyId,
        propertyId,
        status: { in: ['scheduled', 'assigned', 'in_progress'] },
      },
      orderBy: { scheduledStartAt: 'asc' },
    });
  }

  async findByBookingId(companyId: string, bookingId: string) {
    return this.db.cleaningTask.findFirst({
      where: { bookingId, companyId, status: { not: 'canceled' } },
    });
  }

  async list(input: ListCleaningTasksInput) {
    return this.db.cleaningTask.findMany({
      where: {
        companyId: input.companyId,
        ...(input.propertyId ? { propertyId: input.propertyId } : {}),
        ...(input.dateFrom || input.dateTo
          ? {
              scheduledStartAt: {
                ...(input.dateFrom ? { gte: input.dateFrom } : {}),
                ...(input.dateTo ? { lte: input.dateTo } : {}),
              },
            }
          : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: { scheduledStartAt: 'asc' },
      include: { assignedCleaner: true, property: true },
    });
  }

  /**
   * Transition task to a new status. Validates the transition is allowed.
   * Returns null if the task doesn't exist or the transition is invalid.
   */
  async transition(companyId: string, taskId: string, toStatus: string) {
    const task = await this.findById(companyId, taskId);
    if (!task) return null;
    if (!isValidTransition(task.status, toStatus)) return null;

    const updateData: Record<string, unknown> = { status: toStatus };
    if (toStatus === 'completed') {
      updateData.completedAt = new Date();
    }

    return this.db.cleaningTask.update({
      where: { id: taskId },
      data: updateData,
    });
  }

  async assignCleaner(companyId: string, taskId: string, cleanerId: string) {
    const task = await this.findById(companyId, taskId);
    if (!task) return null;
    if (!isValidTransition(task.status, 'assigned')) return null;

    return this.db.cleaningTask.update({
      where: { id: taskId },
      data: { assignedCleanerId: cleanerId, status: 'assigned' },
    });
  }

  async confirmAssignment(companyId: string, taskId: string) {
    const task = await this.findById(companyId, taskId);
    if (!task || task.status !== 'assigned') return null;

    return this.db.cleaningTask.update({
      where: { id: taskId },
      data: { confirmedAt: new Date() },
    });
  }

  async reschedule(
    companyId: string,
    taskId: string,
    scheduledStartAt: Date,
    scheduledEndAt: Date,
  ) {
    const task = await this.findById(companyId, taskId);
    if (!task) return null;
    // Can only reschedule tasks that haven't started yet
    if (task.status !== 'scheduled' && task.status !== 'assigned') return null;

    return this.db.cleaningTask.update({
      where: { id: taskId },
      data: { scheduledStartAt, scheduledEndAt },
    });
  }

  async updatePaymentStatus(companyId: string, taskId: string, paymentStatus: string) {
    const task = await this.findById(companyId, taskId);
    if (!task) return null;

    return this.db.cleaningTask.update({
      where: { id: taskId },
      data: { paymentStatus },
    });
  }

  /**
   * Find tasks that are assigned but not confirmed past the timeout.
   * Used by the no-show checker. When companyId is provided, scopes to that tenant.
   */
  async findUnconfirmedPastDeadline(confirmDeadline: Date, companyId?: string) {
    return this.db.cleaningTask.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        status: 'assigned',
        confirmedAt: null,
        scheduledStartAt: { lte: confirmDeadline },
      },
      include: { property: true },
    });
  }

  /**
   * Find the primary or backup cleaner for a property.
   * priority=1 is primary, priority=2 is backup.
   */
  async findCleanerForProperty(companyId: string, propertyId: string, priority: number) {
    const link = await this.db.cleanerProperty.findFirst({
      where: {
        propertyId,
        priority,
        cleaner: { companyId, status: 'active' },
      },
      include: { cleaner: true },
    });
    return link?.cleaner ?? null;
  }

  /**
   * Find tasks that are assigned, not confirmed, and past their scheduled start.
   * Used by the no-show ladder. Scopes by companyId when provided.
   */
  async findLadderCandidates(now: Date, companyId?: string) {
    return this.db.cleaningTask.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        status: 'assigned',
        confirmedAt: null,
        scheduledStartAt: { lte: now },
      },
      include: { property: true },
    });
  }

  /**
   * Re-assign a task back to 'scheduled' so it can be dispatched again.
   * Used when primary cleaner no-shows and we need to assign backup.
   */
  async unassign(companyId: string, taskId: string) {
    const task = await this.findById(companyId, taskId);
    if (!task || task.status !== 'assigned') return null;

    return this.db.cleaningTask.update({
      where: { id: taskId },
      data: {
        assignedCleanerId: null,
        confirmedAt: null,
        status: 'scheduled',
      },
    });
  }
}
