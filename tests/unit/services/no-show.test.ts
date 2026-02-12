import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { CleaningTaskDal } from '@/dal/cleaning-task.dal';
import { IncidentDal } from '@/dal/incident.dal';
import { triageConfig } from '@/config/triage';

/**
 * Tests the no-show detection logic at the DAL/data level.
 * We create tasks in the 'assigned' state without confirmedAt, past the deadline,
 * then verify the findUnconfirmedPastDeadline query returns them.
 *
 * We also test that the incident DAL correctly records NO_SHOW incidents
 * and that the backup cleaner lookup works.
 */
describe('No-show detection logic', () => {
  let prisma: PrismaClient;
  let taskDal: CleaningTaskDal;
  let incidentDal: IncidentDal;
  let companyId: string;
  let propertyId: string;
  let primaryCleanerId: string;
  let backupCleanerId: string | null = null;
  const createdTaskIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
    });
    await prisma.$connect();
    taskDal = new CleaningTaskDal(prisma);
    incidentDal = new IncidentDal(prisma);

    const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
    companyId = companies[0]!.id;

    const property = await prisma.property.findFirst({ where: { companyId } });
    propertyId = property!.id;

    // Find primary and backup cleaners for this property
    const links = await prisma.cleanerProperty.findMany({
      where: { propertyId },
      include: { cleaner: true },
      orderBy: { priority: 'asc' },
    });

    const primary = links.find((l) => l.priority === 1);
    primaryCleanerId = primary!.cleanerId;

    const backup = links.find((l) => l.priority === 2);
    backupCleanerId = backup?.cleanerId ?? null;
  });

  afterAll(async () => {
    // Clean up test data
    if (createdTaskIds.length > 0) {
      await prisma.incident.deleteMany({ where: { taskId: { in: createdTaskIds } } });
      await prisma.cleaningTask.deleteMany({ where: { id: { in: createdTaskIds } } });
    }
    await prisma.$disconnect();
  });

  it('findUnconfirmedPastDeadline returns tasks past deadline', async () => {
    // Create a task assigned long ago (way past confirm timeout)
    const pastTime = new Date(
      Date.now() - (triageConfig.CONFIRM_TIMEOUT_MINUTES + 60) * 60_000,
    );
    const task = await taskDal.create({
      companyId,
      propertyId,
      scheduledStartAt: pastTime,
      scheduledEndAt: new Date(pastTime.getTime() + 90 * 60_000),
    });
    createdTaskIds.push(task.id);

    // Assign without confirming
    await taskDal.assignCleaner(companyId, task.id, primaryCleanerId);

    const deadline = new Date(
      Date.now() - triageConfig.CONFIRM_TIMEOUT_MINUTES * 60_000,
    );
    const unconfirmed = await taskDal.findUnconfirmedPastDeadline(deadline);

    const found = unconfirmed.find((t) => t.id === task.id);
    expect(found).toBeDefined();
    expect(found!.confirmedAt).toBeNull();
  });

  it('findUnconfirmedPastDeadline excludes confirmed tasks', async () => {
    const pastTime = new Date(
      Date.now() - (triageConfig.CONFIRM_TIMEOUT_MINUTES + 60) * 60_000,
    );
    const task = await taskDal.create({
      companyId,
      propertyId,
      scheduledStartAt: pastTime,
      scheduledEndAt: new Date(pastTime.getTime() + 90 * 60_000),
    });
    createdTaskIds.push(task.id);

    await taskDal.assignCleaner(companyId, task.id, primaryCleanerId);
    await taskDal.confirmAssignment(companyId, task.id);

    const deadline = new Date(
      Date.now() - triageConfig.CONFIRM_TIMEOUT_MINUTES * 60_000,
    );
    const unconfirmed = await taskDal.findUnconfirmedPastDeadline(deadline);

    const found = unconfirmed.find((t) => t.id === task.id);
    expect(found).toBeUndefined();
  });

  it('incident DAL creates NO_SHOW incident', async () => {
    const task = await taskDal.create({
      companyId,
      propertyId,
      scheduledStartAt: new Date('2026-07-01T11:00:00Z'),
      scheduledEndAt: new Date('2026-07-01T12:30:00Z'),
    });
    createdTaskIds.push(task.id);

    const incident = await incidentDal.create({
      companyId,
      propertyId,
      taskId: task.id,
      type: 'NO_SHOW',
      severity: 'med',
      description: 'Primary cleaner did not confirm.',
    });

    expect(incident.type).toBe('NO_SHOW');
    expect(incident.severity).toBe('med');
    expect(incident.companyId).toBe(companyId);
    expect(incident.taskId).toBe(task.id);
  });

  it('finds backup cleaner (priority=2) for a property', async () => {
    const backup = await taskDal.findCleanerForProperty(companyId, propertyId, 2);

    if (backupCleanerId) {
      expect(backup).not.toBeNull();
      expect(backup!.id).toBe(backupCleanerId);
    } else {
      // No backup in seed data — that's ok, just verify null
      expect(backup).toBeNull();
    }
  });

  it('finds primary cleaner (priority=1) for a property', async () => {
    const primary = await taskDal.findCleanerForProperty(companyId, propertyId, 1);
    expect(primary).not.toBeNull();
    expect(primary!.id).toBe(primaryCleanerId);
  });

  it('unassign reverts task to scheduled so backup can be dispatched', async () => {
    const task = await taskDal.create({
      companyId,
      propertyId,
      scheduledStartAt: new Date('2026-07-02T11:00:00Z'),
      scheduledEndAt: new Date('2026-07-02T12:30:00Z'),
    });
    createdTaskIds.push(task.id);

    await taskDal.assignCleaner(companyId, task.id, primaryCleanerId);
    const unassigned = await taskDal.unassign(companyId, task.id);
    expect(unassigned!.status).toBe('scheduled');

    // Now should be assignable again
    if (backupCleanerId) {
      const reassigned = await taskDal.assignCleaner(companyId, task.id, backupCleanerId);
      expect(reassigned).not.toBeNull();
      expect(reassigned!.assignedCleanerId).toBe(backupCleanerId);
      expect(reassigned!.status).toBe('assigned');
    }
  });
});
