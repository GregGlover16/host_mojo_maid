import { PrismaClient } from '@prisma/client';

export interface CleaningRollupResult {
  tasksTotal: number;
  tasksCompleted: number;
  onTimeRate: number; // 0–1 ratio
  noShowCount: number;
  avgCleanDurationMinutes: number | null;
  paymentTotalCents: number;
}

export interface CleaningRollupScope {
  companyId: string;
  propertyId?: string;
  dateFrom: Date;
  dateTo: Date;
}

export class CleaningRollupDal {
  constructor(private readonly db: PrismaClient) {}

  async getRollup(scope: CleaningRollupScope): Promise<CleaningRollupResult> {
    const where = {
      companyId: scope.companyId,
      ...(scope.propertyId ? { propertyId: scope.propertyId } : {}),
      scheduledStartAt: { gte: scope.dateFrom, lte: scope.dateTo },
    };

    // Total tasks in range
    const tasksTotal = await this.db.cleaningTask.count({ where });

    // Completed tasks
    const tasksCompleted = await this.db.cleaningTask.count({
      where: { ...where, status: 'completed' },
    });

    // On-time: completed AND completedAt <= scheduledEndAt
    const completedTasks = await this.db.cleaningTask.findMany({
      where: { ...where, status: 'completed', completedAt: { not: null } },
      select: { completedAt: true, scheduledEndAt: true, scheduledStartAt: true },
    });

    const onTimeCount = completedTasks.filter(
      (t) => t.completedAt && t.completedAt <= t.scheduledEndAt,
    ).length;

    const onTimeRate = tasksCompleted > 0 ? onTimeCount / tasksCompleted : 0;

    // Average cleaning duration (completed tasks with completedAt)
    let avgCleanDurationMinutes: number | null = null;
    if (completedTasks.length > 0) {
      const totalMinutes = completedTasks.reduce((sum, t) => {
        if (!t.completedAt) return sum;
        const diffMs = t.completedAt.getTime() - t.scheduledStartAt.getTime();
        return sum + diffMs / 60_000;
      }, 0);
      avgCleanDurationMinutes = Math.round(totalMinutes / completedTasks.length);
    }

    // No-show count (incidents of type NO_SHOW tied to tasks in this range)
    const taskIds = await this.db.cleaningTask
      .findMany({ where, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));

    const noShowCount =
      taskIds.length > 0
        ? await this.db.incident.count({
            where: { companyId: scope.companyId, taskId: { in: taskIds }, type: 'NO_SHOW' },
          })
        : 0;

    // Payment total (sum of paid tasks)
    const paymentAgg = await this.db.cleaningTask.aggregate({
      where: { ...where, paymentStatus: 'paid' },
      _sum: { paymentAmountCents: true },
    });
    const paymentTotalCents = paymentAgg._sum.paymentAmountCents ?? 0;

    return {
      tasksTotal,
      tasksCompleted,
      onTimeRate,
      noShowCount,
      avgCleanDurationMinutes,
      paymentTotalCents,
    };
  }
}
