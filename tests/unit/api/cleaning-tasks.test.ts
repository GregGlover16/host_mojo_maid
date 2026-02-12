import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '@/app';
import type { FastifyInstance } from 'fastify';

/**
 * API integration tests for cleaning task endpoints.
 * Uses test.db (same DB that the service singleton uses).
 */
describe('Cleaning Task API endpoints', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let companyAId: string;
  let companyBId: string;
  let propertyAId: string;
  let cleanerAId: string;
  const createdTaskIds: string[] = [];

  beforeAll(async () => {
    app = buildApp();
    await app.ready();

    // Connect to the SAME db the services use
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
    });
    await prisma.$connect();

    const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
    companyAId = companies[0]!.id;
    companyBId = companies[1]!.id;

    const property = await prisma.property.findFirst({ where: { companyId: companyAId } });
    propertyAId = property!.id;

    const cleaner = await prisma.cleaner.findFirst({ where: { companyId: companyAId } });
    cleanerAId = cleaner!.id;
  });

  afterAll(async () => {
    // Clean up test-created data
    if (createdTaskIds.length > 0) {
      await prisma.incident.deleteMany({ where: { taskId: { in: createdTaskIds } } });
      // Clean outbox entries related to our test tasks
      for (const taskId of createdTaskIds) {
        await prisma.outbox.deleteMany({
          where: { payloadJson: { contains: taskId } },
        });
      }
      await prisma.cleaningTask.deleteMany({ where: { id: { in: createdTaskIds } } });
    }
    // Clean events created by services during tests
    await prisma.event.deleteMany({
      where: { type: { startsWith: 'task.' } },
    });
    await prisma.event.deleteMany({
      where: { type: { startsWith: 'payment.' } },
    });
    await prisma.$disconnect();
    await app.close();
  });

  // ─── GET /companies/:companyId/cleaning/tasks ───

  describe('GET /companies/:companyId/cleaning/tasks', () => {
    it('returns tasks for a valid company', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/companies/${companyAId}/cleaning/tasks`,
        query: {
          dateFrom: '2025-12-01T00:00:00.000Z',
          dateTo: '2026-12-01T00:00:00.000Z',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ tasks: unknown[] }>();
      expect(body.tasks).toBeDefined();
      expect(body.tasks.length).toBeGreaterThan(0);
    });

    it('returns empty array for a nonexistent company', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/companies/nonexistent-company/cleaning/tasks',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ tasks: unknown[] }>();
      expect(body.tasks.length).toBe(0);
    });

    it('filters by propertyId', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/companies/${companyAId}/cleaning/tasks`,
        query: {
          propertyId: propertyAId,
          dateFrom: '2025-12-01T00:00:00.000Z',
          dateTo: '2026-12-01T00:00:00.000Z',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ tasks: Array<{ propertyId: string }> }>();
      for (const t of body.tasks) {
        expect(t.propertyId).toBe(propertyAId);
      }
    });
  });

  // ─── GET /companies/:companyId/cleaning/rollup ───

  describe('GET /companies/:companyId/cleaning/rollup', () => {
    it('returns rollup metrics', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/companies/${companyAId}/cleaning/rollup`,
        query: {
          dateFrom: '2025-12-01T00:00:00.000Z',
          dateTo: '2026-12-01T00:00:00.000Z',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{
        rollup: { tasksTotal: number; tasksCompleted: number; onTimeRate: number };
      }>();
      expect(body.rollup.tasksTotal).toBeGreaterThan(0);
    });

    it('returns 400 without required dateFrom/dateTo', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/companies/${companyAId}/cleaning/rollup`,
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ─── POST cleaner-accept / check-in / complete lifecycle ───

  describe('Task lifecycle: accept -> check-in -> complete', () => {
    let testTaskId: string;

    beforeAll(async () => {
      // Create a test task and assign a cleaner manually
      const task = await prisma.cleaningTask.create({
        data: {
          companyId: companyAId,
          propertyId: propertyAId,
          scheduledStartAt: new Date('2026-08-01T11:00:00Z'),
          scheduledEndAt: new Date('2026-08-01T12:30:00Z'),
          status: 'assigned',
          assignedCleanerId: cleanerAId,
          paymentAmountCents: 15000,
        },
      });
      testTaskId = task.id;
      createdTaskIds.push(task.id);
    });

    it('POST cleaner-accept returns ok', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/companies/${companyAId}/cleaning/tasks/${testTaskId}/cleaner-accept`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<{ ok: boolean }>().ok).toBe(true);
    });

    it('POST check-in transitions to in_progress', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/companies/${companyAId}/cleaning/tasks/${testTaskId}/check-in`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<{ ok: boolean }>().ok).toBe(true);

      const task = await prisma.cleaningTask.findUnique({ where: { id: testTaskId } });
      expect(task!.status).toBe('in_progress');
    });

    it('POST complete transitions to completed and requests payment', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/companies/${companyAId}/cleaning/tasks/${testTaskId}/complete`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ ok: boolean; paymentRequested: boolean }>();
      expect(body.ok).toBe(true);
      expect(body.paymentRequested).toBe(true);

      const task = await prisma.cleaningTask.findUnique({ where: { id: testTaskId } });
      expect(task!.status).toBe('completed');
      expect(task!.completedAt).not.toBeNull();
      expect(task!.paymentStatus).toBe('requested');
    });
  });

  // ─── Error cases ───

  describe('Error cases', () => {
    it('POST cleaner-accept on non-existent task returns 409', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/companies/${companyAId}/cleaning/tasks/nonexistent-task/cleaner-accept`,
      });

      expect(res.statusCode).toBe(409);
    });

    it('POST check-in on a scheduled (not assigned) task returns 409', async () => {
      const task = await prisma.cleaningTask.create({
        data: {
          companyId: companyAId,
          propertyId: propertyAId,
          scheduledStartAt: new Date('2026-09-01T11:00:00Z'),
          scheduledEndAt: new Date('2026-09-01T12:30:00Z'),
          status: 'scheduled',
        },
      });
      createdTaskIds.push(task.id);

      const res = await app.inject({
        method: 'POST',
        url: `/companies/${companyAId}/cleaning/tasks/${task.id}/check-in`,
      });

      expect(res.statusCode).toBe(409);
    });

    it('POST complete on a canceled task returns 409', async () => {
      const task = await prisma.cleaningTask.create({
        data: {
          companyId: companyAId,
          propertyId: propertyAId,
          scheduledStartAt: new Date('2026-09-02T11:00:00Z'),
          scheduledEndAt: new Date('2026-09-02T12:30:00Z'),
          status: 'canceled',
        },
      });
      createdTaskIds.push(task.id);

      const res = await app.inject({
        method: 'POST',
        url: `/companies/${companyAId}/cleaning/tasks/${task.id}/complete`,
      });

      expect(res.statusCode).toBe(409);
    });
  });

  // ─── Multi-tenant isolation ───

  describe('Multi-tenant isolation for task APIs', () => {
    it('company B cannot accept a company A task', async () => {
      const task = await prisma.cleaningTask.create({
        data: {
          companyId: companyAId,
          propertyId: propertyAId,
          scheduledStartAt: new Date('2026-10-01T11:00:00Z'),
          scheduledEndAt: new Date('2026-10-01T12:30:00Z'),
          status: 'assigned',
          assignedCleanerId: cleanerAId,
        },
      });
      createdTaskIds.push(task.id);

      const res = await app.inject({
        method: 'POST',
        url: `/companies/${companyBId}/cleaning/tasks/${task.id}/cleaner-accept`,
      });

      expect(res.statusCode).toBe(409);
    });

    it('company B cannot check-in to a company A task', async () => {
      const task = await prisma.cleaningTask.create({
        data: {
          companyId: companyAId,
          propertyId: propertyAId,
          scheduledStartAt: new Date('2026-10-02T11:00:00Z'),
          scheduledEndAt: new Date('2026-10-02T12:30:00Z'),
          status: 'assigned',
          assignedCleanerId: cleanerAId,
        },
      });
      createdTaskIds.push(task.id);

      const res = await app.inject({
        method: 'POST',
        url: `/companies/${companyBId}/cleaning/tasks/${task.id}/check-in`,
      });

      expect(res.statusCode).toBe(409);
    });

    it('GET tasks for company A excludes company B data', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/companies/${companyAId}/cleaning/tasks`,
        query: {
          dateFrom: '2025-12-01T00:00:00.000Z',
          dateTo: '2026-12-01T00:00:00.000Z',
        },
      });

      const body = res.json<{ tasks: Array<{ companyId: string }> }>();
      for (const t of body.tasks) {
        expect(t.companyId).toBe(companyAId);
      }
    });
  });
});
