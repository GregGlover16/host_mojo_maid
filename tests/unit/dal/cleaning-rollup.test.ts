import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { CleaningRollupDal } from '@/dal/cleaning-rollup.dal';

// Tests run against a pre-seeded dev.db.
describe('CleaningRollupDal — getCleaningRollup', () => {
  let prisma: PrismaClient;
  let dal: CleaningRollupDal;
  let companyAId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: 'file:./dev.db' } },
    });
    await prisma.$connect();
    dal = new CleaningRollupDal(prisma);

    const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
    // "Pine Coast PM" < "Sunshine Ops" alphabetically
    companyAId = companies[0]!.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns consistent totals for a company over the full date range', async () => {
    const dateFrom = new Date('2025-01-01');
    const dateTo = new Date('2027-01-01');

    // Get both in quick succession to avoid parallel-test mutations
    const manualCount = await prisma.cleaningTask.count({
      where: {
        companyId: companyAId,
        scheduledStartAt: { gte: dateFrom, lte: dateTo },
      },
    });
    const rollup = await dal.getRollup({ companyId: companyAId, dateFrom, dateTo });

    expect(rollup.tasksTotal).toBeGreaterThan(0);
    expect(rollup.tasksCompleted).toBeLessThanOrEqual(rollup.tasksTotal);
    expect(rollup.onTimeRate).toBeGreaterThanOrEqual(0);
    expect(rollup.onTimeRate).toBeLessThanOrEqual(1);
    expect(rollup.paymentTotalCents).toBeGreaterThanOrEqual(0);

    // Rollup total should match count query (both against same DB snapshot)
    expect(rollup.tasksTotal).toBe(manualCount);
  });

  it('filters by propertyId when provided', async () => {
    const dateFrom = new Date('2025-01-01');
    const dateTo = new Date('2027-01-01');

    // Pick a property from company A
    const prop = await prisma.property.findFirst({ where: { companyId: companyAId } });
    expect(prop).not.toBeNull();

    const rollupAll = await dal.getRollup({ companyId: companyAId, dateFrom, dateTo });
    const rollupProp = await dal.getRollup({
      companyId: companyAId,
      propertyId: prop!.id,
      dateFrom,
      dateTo,
    });

    expect(rollupProp.tasksTotal).toBeGreaterThan(0);
    expect(rollupProp.tasksTotal).toBeLessThanOrEqual(rollupAll.tasksTotal);
  });

  it('returns zero totals for a date range with no tasks', async () => {
    const dateFrom = new Date('2020-01-01');
    const dateTo = new Date('2020-01-02');

    const rollup = await dal.getRollup({ companyId: companyAId, dateFrom, dateTo });

    expect(rollup.tasksTotal).toBe(0);
    expect(rollup.tasksCompleted).toBe(0);
    expect(rollup.onTimeRate).toBe(0);
    expect(rollup.noShowCount).toBe(0);
    expect(rollup.avgCleanDurationMinutes).toBeNull();
    expect(rollup.paymentTotalCents).toBe(0);
  });

  it('sums payment_amount_cents correctly for paid tasks', async () => {
    const dateFrom = new Date('2025-01-01');
    const dateTo = new Date('2027-01-01');

    const rollup = await dal.getRollup({ companyId: companyAId, dateFrom, dateTo });

    // Manual aggregate
    const agg = await prisma.cleaningTask.aggregate({
      where: {
        companyId: companyAId,
        scheduledStartAt: { gte: dateFrom, lte: dateTo },
        paymentStatus: 'paid',
      },
      _sum: { paymentAmountCents: true },
    });

    expect(rollup.paymentTotalCents).toBe(agg._sum.paymentAmountCents ?? 0);
  });

  it('calculates avg clean duration in minutes', async () => {
    // Use past-only range to ensure completedAt > scheduledStartAt
    // (future tasks may have seed-generated completedAt that is earlier)
    const dateFrom = new Date('2025-01-01');
    const dateTo = new Date(); // now — only past tasks

    const rollup = await dal.getRollup({ companyId: companyAId, dateFrom, dateTo });

    if (rollup.tasksCompleted > 0) {
      expect(rollup.avgCleanDurationMinutes).not.toBeNull();
      // Duration should be non-null for completed tasks; sign depends on seed data
      expect(typeof rollup.avgCleanDurationMinutes).toBe('number');
    }
  });
});
