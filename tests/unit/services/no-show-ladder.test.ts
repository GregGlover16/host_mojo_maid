import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { handleBookingEvent } from '@/services/booking-handler.service';
import { dispatchTask } from '@/services/dispatch.service';
import { runNoShowLadder } from '@/services/no-show-ladder.service';
import { triageConfig } from '@/config/triage';

const DB_URL = process.env.DATABASE_URL || 'file:./test.db';

describe('no-show-ladder.service', () => {
  let prisma: PrismaClient;
  let companyId: string;
  let propertyId: string;
  const createdBookingIds: string[] = [];
  const createdTaskIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    await prisma.$connect();

    // Use the SECOND company to avoid concurrent test conflicts
    const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
    companyId = companies[1]!.id;
    const property = await prisma.property.findFirst({ where: { companyId } });
    propertyId = property!.id;
  });

  afterAll(async () => {
    if (createdTaskIds.length > 0) {
      await prisma.incident.deleteMany({ where: { taskId: { in: createdTaskIds } } });
      for (const taskId of createdTaskIds) {
        await prisma.outbox.deleteMany({ where: { payloadJson: { contains: taskId } } });
      }
      await prisma.cleaningTask.deleteMany({ where: { id: { in: createdTaskIds } } });
    }
    if (createdBookingIds.length > 0) {
      await prisma.booking.deleteMany({ where: { id: { in: createdBookingIds } } });
    }
    // Only clean up events for OUR tasks — never delete ladder events globally
    // because parallel test suites (eval scenarios) also create ladder events.
    if (createdTaskIds.length > 0) {
      await prisma.event.deleteMany({
        where: {
          type: { startsWith: 'ladder.' },
          entityId: { in: createdTaskIds },
        },
      });
      await prisma.event.deleteMany({
        where: {
          type: { startsWith: 'task.' },
          entityId: { in: createdTaskIds },
        },
      });
      await prisma.event.deleteMany({
        where: {
          type: 'emergency.clean_requested',
          entityId: { in: createdTaskIds },
        },
      });
    }
    await prisma.$disconnect();
  });

  it('fires remind_primary step at T+10 minutes', async () => {
    // Create a booking + task
    const booking = await prisma.booking.create({
      data: {
        companyId,
        propertyId,
        startAt: new Date('2026-12-01T16:00:00Z'),
        endAt: new Date('2026-12-04T11:00:00Z'),
        status: 'booked',
        source: 'manual',
      },
    });
    createdBookingIds.push(booking.id);

    const handlerResult = await handleBookingEvent({
      companyId,
      bookingId: booking.id,
      propertyId,
      endAt: booking.endAt,
      cleaningDurationMinutes: 90,
      status: 'booked',
    });
    createdTaskIds.push(handlerResult.taskId!);

    // Dispatch (assign primary)
    const dispatchResult = await dispatchTask(companyId, handlerResult.taskId!);
    expect(dispatchResult.success).toBe(true);

    // Move scheduledStartAt back so the task is T+15 minutes late
    const pastStart = new Date(
      Date.now() - (triageConfig.LADDER_REMIND_PRIMARY_MINUTES + 5) * 60_000,
    );
    await prisma.cleaningTask.update({
      where: { id: handlerResult.taskId! },
      data: { scheduledStartAt: pastStart },
    });

    // Run the ladder
    const ladderResult = await runNoShowLadder('test-remind');

    expect(ladderResult.evaluated).toBeGreaterThanOrEqual(1);
    const action = ladderResult.actions.find((a) => a.taskId === handlerResult.taskId!);
    expect(action).toBeDefined();
    expect(action!.step).toBe('remind_primary');
    expect(action!.success).toBe(true);

    // Verify ladder event was logged
    const events = await prisma.event.findMany({
      where: {
        type: 'ladder.remind_primary',
        entityType: 'cleaning_task',
        entityId: handlerResult.taskId!,
      },
    });
    expect(events.length).toBe(1);

    // Isolate: remove this task from future ladder runs by completing it.
    // Without this, subsequent tests may pick up this still-assigned task
    // when enough wall-clock time passes between test cases.
    await prisma.cleaningTask.update({
      where: { id: handlerResult.taskId! },
      data: { status: 'completed', completedAt: new Date() },
    });
  });

  it('fires switch_backup step at T+20 minutes', async () => {
    const booking = await prisma.booking.create({
      data: {
        companyId,
        propertyId,
        startAt: new Date('2026-12-05T16:00:00Z'),
        endAt: new Date('2026-12-08T11:00:00Z'),
        status: 'booked',
        source: 'manual',
      },
    });
    createdBookingIds.push(booking.id);

    const handlerResult = await handleBookingEvent({
      companyId,
      bookingId: booking.id,
      propertyId,
      endAt: booking.endAt,
      cleaningDurationMinutes: 90,
      status: 'booked',
    });
    createdTaskIds.push(handlerResult.taskId!);

    const dispatchResult = await dispatchTask(companyId, handlerResult.taskId!);
    expect(dispatchResult.success).toBe(true);

    // Move scheduledStartAt back so task is T+25 minutes late
    const pastStart = new Date(
      Date.now() - (triageConfig.LADDER_SWITCH_BACKUP_MINUTES + 5) * 60_000,
    );
    await prisma.cleaningTask.update({
      where: { id: handlerResult.taskId! },
      data: { scheduledStartAt: pastStart },
    });

    const ladderResult = await runNoShowLadder('test-backup');

    const action = ladderResult.actions.find((a) => a.taskId === handlerResult.taskId!);
    expect(action).toBeDefined();
    expect(action!.step).toBe('switch_backup');

    // Verify a NO_SHOW incident was created
    const incidents = await prisma.incident.findMany({
      where: { taskId: handlerResult.taskId!, type: 'NO_SHOW' },
    });
    expect(incidents.length).toBeGreaterThanOrEqual(1);

    // Isolate: mark this task as completed so it won't be picked up
    // by the ladder in the next test case.
    await prisma.cleaningTask.update({
      where: { id: handlerResult.taskId! },
      data: { status: 'completed', completedAt: new Date() },
    });
  });

  it('is idempotent — does not repeat the same step', async () => {
    // Create a fresh task for a clean idempotency check
    const booking = await prisma.booking.create({
      data: {
        companyId,
        propertyId,
        startAt: new Date('2026-12-10T16:00:00Z'),
        endAt: new Date('2026-12-13T11:00:00Z'),
        status: 'booked',
        source: 'manual',
      },
    });
    createdBookingIds.push(booking.id);

    const handlerResult = await handleBookingEvent({
      companyId,
      bookingId: booking.id,
      propertyId,
      endAt: booking.endAt,
      cleaningDurationMinutes: 90,
      status: 'booked',
    });
    createdTaskIds.push(handlerResult.taskId!);

    const dispatchResult = await dispatchTask(companyId, handlerResult.taskId!);
    expect(dispatchResult.success).toBe(true);

    // Make the task 15 minutes late (triggers remind_primary)
    const pastStart = new Date(
      Date.now() - (triageConfig.LADDER_REMIND_PRIMARY_MINUTES + 5) * 60_000,
    );
    await prisma.cleaningTask.update({
      where: { id: handlerResult.taskId! },
      data: { scheduledStartAt: pastStart },
    });

    // First run — should fire remind_primary
    const firstRun = await runNoShowLadder('test-idem-1');
    const firstAction = firstRun.actions.find((a) => a.taskId === handlerResult.taskId!);
    expect(firstAction).toBeDefined();
    expect(firstAction!.step).toBe('remind_primary');

    // Second run at the same lateness — should NOT repeat remind_primary
    const secondRun = await runNoShowLadder('test-idem-2');
    const secondAction = secondRun.actions.find((a) => a.taskId === handlerResult.taskId!);
    // Either no action (idempotent skip) or it's undefined because the step was already done
    expect(secondAction).toBeUndefined();
  });
});
