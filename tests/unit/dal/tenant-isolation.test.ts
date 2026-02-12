import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { CleaningRollupDal } from '@/dal/cleaning-rollup.dal';

// Proves that querying company A never returns company B data.
describe('Multi-tenant isolation', () => {
  let prisma: PrismaClient;
  let dal: CleaningRollupDal;
  let companyAId: string;
  let companyBId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: 'file:./dev.db' } },
    });
    await prisma.$connect();
    dal = new CleaningRollupDal(prisma);

    const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
    companyAId = companies[0]!.id;
    companyBId = companies[1]!.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('properties for company A belong only to company A', async () => {
    const propsA = await prisma.property.findMany({ where: { companyId: companyAId } });
    expect(propsA.length).toBe(10);
    for (const p of propsA) {
      expect(p.companyId).toBe(companyAId);
    }
  });

  it('properties for company B belong only to company B', async () => {
    const propsB = await prisma.property.findMany({ where: { companyId: companyBId } });
    expect(propsB.length).toBe(10);
    for (const p of propsB) {
      expect(p.companyId).toBe(companyBId);
    }
  });

  it('bookings scoped by company never leak across tenants', async () => {
    const bookingsA = await prisma.booking.findMany({ where: { companyId: companyAId } });
    const bookingsB = await prisma.booking.findMany({ where: { companyId: companyBId } });

    // Company A bookings are on company A properties
    const propsA = new Set(
      (await prisma.property.findMany({ where: { companyId: companyAId } })).map((p) => p.id),
    );
    for (const b of bookingsA) {
      expect(b.companyId).toBe(companyAId);
      expect(propsA.has(b.propertyId)).toBe(true);
    }

    // Company B bookings are on company B properties
    const propsB = new Set(
      (await prisma.property.findMany({ where: { companyId: companyBId } })).map((p) => p.id),
    );
    for (const b of bookingsB) {
      expect(b.companyId).toBe(companyBId);
      expect(propsB.has(b.propertyId)).toBe(true);
    }

    // No overlap
    for (const propId of propsA) {
      expect(propsB.has(propId)).toBe(false);
    }
  });

  it('cleaning tasks scoped by company never leak across tenants', async () => {
    const tasksA = await prisma.cleaningTask.findMany({ where: { companyId: companyAId } });
    const tasksB = await prisma.cleaningTask.findMany({ where: { companyId: companyBId } });

    for (const t of tasksA) {
      expect(t.companyId).toBe(companyAId);
    }
    for (const t of tasksB) {
      expect(t.companyId).toBe(companyBId);
    }

    // IDs don't overlap
    const idsA = new Set(tasksA.map((t) => t.id));
    for (const t of tasksB) {
      expect(idsA.has(t.id)).toBe(false);
    }
  });

  it('cleaners scoped by company never leak across tenants', async () => {
    const cleanersA = await prisma.cleaner.findMany({ where: { companyId: companyAId } });
    const cleanersB = await prisma.cleaner.findMany({ where: { companyId: companyBId } });

    for (const c of cleanersA) {
      expect(c.companyId).toBe(companyAId);
    }
    for (const c of cleanersB) {
      expect(c.companyId).toBe(companyBId);
    }
  });

  it('rollup for company A excludes company B data', async () => {
    const dateFrom = new Date('2025-01-01');
    const dateTo = new Date('2027-01-01');

    const rollupA = await dal.getRollup({ companyId: companyAId, dateFrom, dateTo });
    const rollupB = await dal.getRollup({ companyId: companyBId, dateFrom, dateTo });

    // Both should have data
    expect(rollupA.tasksTotal).toBeGreaterThan(0);
    expect(rollupB.tasksTotal).toBeGreaterThan(0);

    // Verify sum matches global total
    const globalCount = await prisma.cleaningTask.count({
      where: { scheduledStartAt: { gte: dateFrom, lte: dateTo } },
    });
    expect(rollupA.tasksTotal + rollupB.tasksTotal).toBe(globalCount);
  });

  it('incidents are tenant-scoped', async () => {
    const incidentsA = await prisma.incident.findMany({ where: { companyId: companyAId } });
    const incidentsB = await prisma.incident.findMany({ where: { companyId: companyBId } });

    for (const i of incidentsA) {
      expect(i.companyId).toBe(companyAId);
    }
    for (const i of incidentsB) {
      expect(i.companyId).toBe(companyBId);
    }
  });
});
