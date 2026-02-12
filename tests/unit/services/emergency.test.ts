import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { requestEmergencyCleaning } from '@/services/emergency.service';

const DB_URL = process.env.DATABASE_URL || 'file:./test.db';

describe('emergency.service', () => {
  let prisma: PrismaClient;
  let companyId: string;
  let propertyId: string;
  let property2Id: string | undefined;
  const createdTaskIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    await prisma.$connect();

    // Use the SECOND company to avoid concurrent test conflicts with the
    // first company which most other tests use.
    const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
    companyId = companies[1]!.id;

    // Pick last two properties for further isolation
    const properties = await prisma.property.findMany({
      where: { companyId },
      orderBy: { name: 'desc' },
      take: 2,
    });
    propertyId = properties[0]!.id;
    property2Id = properties[1]?.id;
  });

  afterAll(async () => {
    if (createdTaskIds.length > 0) {
      await prisma.incident.deleteMany({ where: { taskId: { in: createdTaskIds } } });
      for (const taskId of createdTaskIds) {
        await prisma.outbox.deleteMany({ where: { payloadJson: { contains: taskId } } });
      }
      await prisma.cleaningTask.deleteMany({ where: { id: { in: createdTaskIds } } });
    }
    await prisma.event.deleteMany({ where: { type: 'emergency.clean_requested' } });
    await prisma.$disconnect();
  });

  it('creates an emergency request with incident and outbox rows', async () => {
    const neededBy = new Date(Date.now() + 3 * 60 * 60_000).toISOString();

    const result = await requestEmergencyCleaning({
      companyId,
      propertyId,
      neededBy,
      reason: 'Guest complaint about cleanliness',
    });

    expect(result.success).toBe(true);
    expect(result.incidentId).toBeDefined();
    expect(result.outboxId).toBeDefined();

    // Track created tasks for cleanup
    const newTasks = await prisma.cleaningTask.findMany({
      where: { companyId, propertyId, vendor: 'handy' },
      select: { id: true },
    });
    createdTaskIds.push(...newTasks.map((t) => t.id));

    // Verify incident was created
    const incidents = await prisma.incident.findMany({
      where: { id: result.incidentId },
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.severity).toBe('high');
    expect(incidents[0]!.type).toBe('OTHER');

    // Verify outbox rows
    const outboxRows = await prisma.outbox.findMany({
      where: {
        companyId,
        type: { in: ['emergency_clean_request', 'notify_host'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const types = outboxRows.map((r) => r.type);
    expect(types).toContain('emergency_clean_request');
    expect(types).toContain('notify_host');
  });

  it('creates a new task when no active task exists', async () => {
    if (!property2Id) return; // skip if only one property

    // Cancel any existing tasks so emergency creates a new one
    await prisma.cleaningTask.updateMany({
      where: { companyId, propertyId: property2Id, status: { in: ['scheduled', 'assigned'] } },
      data: { status: 'canceled' },
    });

    const result = await requestEmergencyCleaning({
      companyId,
      propertyId: property2Id,
      neededBy: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
      reason: 'Same-day booking emergency',
    });

    expect(result.success).toBe(true);

    // A new handy task should have been created
    const tasks = await prisma.cleaningTask.findMany({
      where: { companyId, propertyId: property2Id, vendor: 'handy' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    createdTaskIds.push(tasks[0]!.id);
  });

  it('logs a telemetry event', async () => {
    const events = await prisma.event.findMany({
      where: { type: 'emergency.clean_requested' },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});
