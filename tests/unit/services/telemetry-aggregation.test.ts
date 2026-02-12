import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  computePercentiles,
  getIncidentCounts,
} from '@/services/telemetry-aggregation.service';

const DB_URL = process.env.DATABASE_URL || 'file:./test.db';

describe('telemetry-aggregation', () => {
  let prisma: PrismaClient;
  let companyId: string;
  let propertyId: string;
  let taskId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    await prisma.$connect();

    const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
    companyId = companies[0]!.id;
    const property = await prisma.property.findFirst({ where: { companyId } });
    propertyId = property!.id;

    // Create a task for incident tests
    const task = await prisma.cleaningTask.create({
      data: {
        companyId,
        propertyId,
        scheduledStartAt: new Date('2026-06-01T11:00:00Z'),
        scheduledEndAt: new Date('2026-06-01T12:30:00Z'),
        status: 'completed',
      },
    });
    taskId = task.id;
  });

  afterAll(async () => {
    await prisma.incident.deleteMany({ where: { taskId } });
    await prisma.cleaningTask.delete({ where: { id: taskId } });
    await prisma.$disconnect();
  });

  describe('computePercentiles', () => {
    it('returns zeros for empty array', () => {
      const stats = computePercentiles([]);
      expect(stats).toEqual({ count: 0, p50: 0, p95: 0, min: 0, max: 0 });
    });

    it('computes p50 for a single value', () => {
      const stats = computePercentiles([42]);
      expect(stats.count).toBe(1);
      expect(stats.p50).toBe(42);
      expect(stats.p95).toBe(42);
      expect(stats.min).toBe(42);
      expect(stats.max).toBe(42);
    });

    it('computes correct p50 and p95 for sorted input', () => {
      const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const stats = computePercentiles(durations);
      expect(stats.count).toBe(10);
      expect(stats.p50).toBe(60); // index 5
      expect(stats.p95).toBe(100); // index 9
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(100);
    });

    it('computes correct p50 and p95 for unsorted input', () => {
      const durations = [100, 10, 50, 80, 30, 90, 20, 60, 40, 70];
      const stats = computePercentiles(durations);
      expect(stats.count).toBe(10);
      // After sorting: [10,20,30,40,50,60,70,80,90,100]
      expect(stats.p50).toBe(60);
      expect(stats.p95).toBe(100);
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(100);
    });

    it('handles 20 values correctly', () => {
      // 1..20
      const durations = Array.from({ length: 20 }, (_, i) => (i + 1) * 10);
      const stats = computePercentiles(durations);
      expect(stats.count).toBe(20);
      expect(stats.p50).toBe(110); // index 10 = 110
      expect(stats.p95).toBe(200); // index 19 = 200
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(200);
    });
  });

  describe('getIncidentCounts', () => {
    it('counts incidents by type within date range', async () => {
      // Create test incidents
      await prisma.incident.createMany({
        data: [
          {
            companyId,
            propertyId,
            taskId,
            type: 'NO_SHOW',
            severity: 'med',
            description: 'test no-show 1',
          },
          {
            companyId,
            propertyId,
            taskId,
            type: 'NO_SHOW',
            severity: 'med',
            description: 'test no-show 2',
          },
          {
            companyId,
            propertyId,
            taskId,
            type: 'DAMAGE',
            severity: 'high',
            description: 'test damage',
          },
        ],
      });

      const counts = await getIncidentCounts(
        new Date(Date.now() - 60 * 60_000), // last hour
      );

      expect(counts.NO_SHOW).toBeGreaterThanOrEqual(2);
      expect(counts.DAMAGE).toBeGreaterThanOrEqual(1);
    });

    it('returns empty object when no incidents in range', async () => {
      const counts = await getIncidentCounts(
        new Date(Date.now() + 24 * 60 * 60_000), // future
      );
      expect(Object.keys(counts).length).toBe(0);
    });
  });
});
