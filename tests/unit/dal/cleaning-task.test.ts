import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { CleaningTaskDal, isValidTransition } from '@/dal/cleaning-task.dal';

describe('CleaningTaskDal', () => {
  let prisma: PrismaClient;
  let dal: CleaningTaskDal;
  let companyAId: string;
  let propertyAId: string;
  let cleanerAId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
    });
    await prisma.$connect();
    dal = new CleaningTaskDal(prisma);

    const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
    companyAId = companies[0]!.id;

    const property = await prisma.property.findFirst({ where: { companyId: companyAId } });
    propertyAId = property!.id;

    const cleaner = await prisma.cleaner.findFirst({ where: { companyId: companyAId } });
    cleanerAId = cleaner!.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Clean up tasks created by tests
  const createdTaskIds: string[] = [];
  beforeEach(() => {
    createdTaskIds.length = 0;
  });

  async function cleanup() {
    if (createdTaskIds.length > 0) {
      // Delete incidents first (FK constraint)
      await prisma.incident.deleteMany({ where: { taskId: { in: createdTaskIds } } });
      await prisma.cleaningTask.deleteMany({ where: { id: { in: createdTaskIds } } });
    }
  }

  afterAll(async () => {
    await cleanup();
  });

  it('creates a task with correct defaults', async () => {
    const task = await dal.create({
      companyId: companyAId,
      propertyId: propertyAId,
      scheduledStartAt: new Date('2026-06-01T11:00:00Z'),
      scheduledEndAt: new Date('2026-06-01T12:30:00Z'),
    });
    createdTaskIds.push(task.id);

    expect(task.companyId).toBe(companyAId);
    expect(task.propertyId).toBe(propertyAId);
    expect(task.status).toBe('scheduled');
    expect(task.paymentStatus).toBe('none');
    expect(task.assignedCleanerId).toBeNull();
    expect(task.confirmedAt).toBeNull();
  });

  it('findById returns task only for correct company', async () => {
    const task = await dal.create({
      companyId: companyAId,
      propertyId: propertyAId,
      scheduledStartAt: new Date('2026-06-01T11:00:00Z'),
      scheduledEndAt: new Date('2026-06-01T12:30:00Z'),
    });
    createdTaskIds.push(task.id);

    const found = await dal.findById(companyAId, task.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(task.id);

    // Wrong company → null
    const notFound = await dal.findById('fake-company-id', task.id);
    expect(notFound).toBeNull();
  });

  it('assigns a cleaner and transitions to assigned', async () => {
    const task = await dal.create({
      companyId: companyAId,
      propertyId: propertyAId,
      scheduledStartAt: new Date('2026-06-02T11:00:00Z'),
      scheduledEndAt: new Date('2026-06-02T12:30:00Z'),
    });
    createdTaskIds.push(task.id);

    const assigned = await dal.assignCleaner(companyAId, task.id, cleanerAId);
    expect(assigned).not.toBeNull();
    expect(assigned!.status).toBe('assigned');
    expect(assigned!.assignedCleanerId).toBe(cleanerAId);
  });

  it('confirmAssignment sets confirmedAt', async () => {
    const task = await dal.create({
      companyId: companyAId,
      propertyId: propertyAId,
      scheduledStartAt: new Date('2026-06-03T11:00:00Z'),
      scheduledEndAt: new Date('2026-06-03T12:30:00Z'),
    });
    createdTaskIds.push(task.id);

    await dal.assignCleaner(companyAId, task.id, cleanerAId);
    const confirmed = await dal.confirmAssignment(companyAId, task.id);
    expect(confirmed).not.toBeNull();
    expect(confirmed!.confirmedAt).not.toBeNull();
  });

  it('reschedule updates times', async () => {
    const task = await dal.create({
      companyId: companyAId,
      propertyId: propertyAId,
      scheduledStartAt: new Date('2026-06-04T11:00:00Z'),
      scheduledEndAt: new Date('2026-06-04T12:30:00Z'),
    });
    createdTaskIds.push(task.id);

    const newStart = new Date('2026-06-05T11:00:00Z');
    const newEnd = new Date('2026-06-05T12:30:00Z');
    const rescheduled = await dal.reschedule(companyAId, task.id, newStart, newEnd);
    expect(rescheduled).not.toBeNull();
    expect(rescheduled!.scheduledStartAt.getTime()).toBe(newStart.getTime());
    expect(rescheduled!.scheduledEndAt.getTime()).toBe(newEnd.getTime());
  });

  it('transition to completed sets completedAt', async () => {
    const task = await dal.create({
      companyId: companyAId,
      propertyId: propertyAId,
      scheduledStartAt: new Date('2026-06-06T11:00:00Z'),
      scheduledEndAt: new Date('2026-06-06T12:30:00Z'),
    });
    createdTaskIds.push(task.id);

    await dal.assignCleaner(companyAId, task.id, cleanerAId);
    await dal.transition(companyAId, task.id, 'in_progress');
    const completed = await dal.transition(companyAId, task.id, 'completed');
    expect(completed).not.toBeNull();
    expect(completed!.status).toBe('completed');
    expect(completed!.completedAt).not.toBeNull();
  });

  it('unassign resets cleaner and confirmedAt', async () => {
    const task = await dal.create({
      companyId: companyAId,
      propertyId: propertyAId,
      scheduledStartAt: new Date('2026-06-07T11:00:00Z'),
      scheduledEndAt: new Date('2026-06-07T12:30:00Z'),
    });
    createdTaskIds.push(task.id);

    await dal.assignCleaner(companyAId, task.id, cleanerAId);
    const unassigned = await dal.unassign(companyAId, task.id);
    expect(unassigned).not.toBeNull();
    expect(unassigned!.status).toBe('scheduled');
    expect(unassigned!.assignedCleanerId).toBeNull();
    expect(unassigned!.confirmedAt).toBeNull();
  });

  it('list filters by companyId, propertyId, dateRange', async () => {
    const tasks = await dal.list({
      companyId: companyAId,
      propertyId: propertyAId,
      dateFrom: new Date('2025-01-01'),
      dateTo: new Date('2027-01-01'),
    });

    expect(tasks.length).toBeGreaterThan(0);
    for (const t of tasks) {
      expect(t.companyId).toBe(companyAId);
      expect(t.propertyId).toBe(propertyAId);
    }
  });
});

describe('isValidTransition — state machine', () => {
  // Valid transitions
  it.each([
    ['scheduled', 'assigned'],
    ['scheduled', 'canceled'],
    ['assigned', 'in_progress'],
    ['assigned', 'canceled'],
    ['assigned', 'failed'],
    ['assigned', 'scheduled'],
    ['in_progress', 'completed'],
    ['in_progress', 'failed'],
  ])('%s → %s is valid', (from, to) => {
    expect(isValidTransition(from, to)).toBe(true);
  });

  // Invalid transitions
  it.each([
    ['scheduled', 'completed'],
    ['scheduled', 'in_progress'],
    ['scheduled', 'failed'],
    ['assigned', 'completed'],
    ['in_progress', 'assigned'],
    ['in_progress', 'scheduled'],
    ['in_progress', 'canceled'],
    ['completed', 'scheduled'],
    ['completed', 'assigned'],
    ['completed', 'canceled'],
    ['canceled', 'scheduled'],
    ['canceled', 'assigned'],
    ['failed', 'scheduled'],
    ['failed', 'completed'],
  ])('%s → %s is invalid', (from, to) => {
    expect(isValidTransition(from, to)).toBe(false);
  });

  it('returns false for unknown status', () => {
    expect(isValidTransition('nonexistent', 'assigned')).toBe(false);
  });
});
