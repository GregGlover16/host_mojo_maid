import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { handleBookingEvent } from '@/services/booking-handler.service';
import { dispatchTask, acceptTask, checkInTask, completeTask } from '@/services/dispatch.service';
import { requestPayment } from '@/services/payment.service';
import { checkForNoShows } from '@/services/no-show.service';
import { runNoShowLadder } from '@/services/no-show-ladder.service';
import { triageConfig } from '@/config/triage';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Eval-driven scenario runner.
 * Loads scenario JSON files from eval/scenarios/ and plays them through
 * the triage engine, then asserts expected end states.
 */

// Use test.db — same as the service singleton
const DB_URL = process.env.DATABASE_URL || 'file:./test.db';

interface ScenarioFile {
  name: string;
  description: string;
  steps: Array<{
    action: string;
    taskIndex?: number;
    minutesLate?: number;
    booking?: {
      startAt?: string;
      endAt?: string;
      status?: string;
    };
  }>;
  expectedEndState: Record<string, unknown>;
}

function loadScenario(filename: string): ScenarioFile {
  const filePath = path.resolve(__dirname, '../../eval/scenarios', filename);
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as ScenarioFile;
}

describe('Eval Scenarios', () => {
  let prisma: PrismaClient;
  let companyId: string;
  let propertyId: string;
  const createdBookingIds: string[] = [];
  const createdTaskIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    await prisma.$connect();

    const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
    companyId = companies[0]!.id;

    const property = await prisma.property.findFirst({ where: { companyId } });
    propertyId = property!.id;
  });

  afterAll(async () => {
    // Clean up in dependency order
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
    // Only clean up events for OUR tasks — never delete events globally
    // because parallel test suites also create events of the same type.
    if (createdTaskIds.length > 0) {
      await prisma.event.deleteMany({
        where: {
          entityId: { in: createdTaskIds },
          type: { startsWith: 'task.' },
        },
      });
      await prisma.event.deleteMany({
        where: {
          entityId: { in: createdTaskIds },
          type: { startsWith: 'payment.' },
        },
      });
      await prisma.event.deleteMany({
        where: {
          entityId: { in: createdTaskIds },
          type: { startsWith: 'incident.' },
        },
      });
      await prisma.event.deleteMany({
        where: {
          entityId: { in: createdTaskIds },
          type: { startsWith: 'ladder.' },
        },
      });
      await prisma.event.deleteMany({
        where: {
          entityId: { in: createdTaskIds },
          type: 'emergency.clean_requested',
        },
      });
    }
    await prisma.$disconnect();
  });

  // ─── Scenario 1: Back-to-back success ───

  it('back-to-back booking success', async () => {
    const scenario = loadScenario('back-to-back-success.json');
    const taskIds: string[] = [];
    const bookingIds: string[] = [];

    // Step through bookings
    for (const step of scenario.steps) {
      if (step.action === 'booking.created' && step.booking) {
        const booking = await prisma.booking.create({
          data: {
            companyId,
            propertyId,
            startAt: new Date(step.booking.startAt!),
            endAt: new Date(step.booking.endAt!),
            status: 'booked',
            source: 'manual',
          },
        });
        bookingIds.push(booking.id);
        createdBookingIds.push(booking.id);

        const result = await handleBookingEvent({
          companyId,
          bookingId: booking.id,
          propertyId,
          endAt: booking.endAt,
          cleaningDurationMinutes: 90,
          status: 'booked',
        });
        expect(result.action).toBe('created');
        taskIds.push(result.taskId!);
        createdTaskIds.push(result.taskId!);
      } else if (step.action === 'dispatch') {
        const r = await dispatchTask(companyId, taskIds[step.taskIndex!]!);
        expect(r.success).toBe(true);
      } else if (step.action === 'accept') {
        const r = await acceptTask(companyId, taskIds[step.taskIndex!]!);
        expect(r.success).toBe(true);
      } else if (step.action === 'check-in') {
        const r = await checkInTask(companyId, taskIds[step.taskIndex!]!);
        expect(r.success).toBe(true);
      } else if (step.action === 'complete') {
        const r = await completeTask(companyId, taskIds[step.taskIndex!]!);
        expect(r.success).toBe(true);
        // Trigger payment
        await requestPayment(companyId, taskIds[step.taskIndex!]!);
      }
    }

    // Assert end state
    const es = scenario.expectedEndState;
    expect(taskIds.length).toBe(es.taskCount);
    for (const tid of taskIds) {
      const task = await prisma.cleaningTask.findUnique({ where: { id: tid } });
      expect(task!.status).toBe(es.allTasksStatus);
    }
    const incidents = await prisma.incident.findMany({
      where: { taskId: { in: taskIds } },
    });
    expect(incidents.length).toBe(es.incidentCount);
  });

  // ─── Scenario 2: Booking extension reschedules task ───

  it('booking extension reschedules cleaning task', async () => {
    const scenario = loadScenario('booking-extension-reschedule.json');
    let bookingId: string | undefined;
    let taskId: string | undefined;

    for (const step of scenario.steps) {
      if (step.action === 'booking.created' && step.booking) {
        const booking = await prisma.booking.create({
          data: {
            companyId,
            propertyId,
            startAt: new Date(step.booking.startAt!),
            endAt: new Date(step.booking.endAt!),
            status: 'booked',
            source: 'manual',
          },
        });
        bookingId = booking.id;
        createdBookingIds.push(booking.id);

        const r = await handleBookingEvent({
          companyId,
          bookingId: booking.id,
          propertyId,
          endAt: booking.endAt,
          cleaningDurationMinutes: 90,
          status: 'booked',
        });
        expect(r.action).toBe('created');
        taskId = r.taskId!;
        createdTaskIds.push(taskId);
      } else if (step.action === 'booking.updated' && step.booking) {
        const r = await handleBookingEvent({
          companyId,
          bookingId: bookingId!,
          propertyId,
          endAt: new Date(step.booking.endAt!),
          cleaningDurationMinutes: 90,
          status: 'booked',
        });
        expect(r.action).toBe('rescheduled');
      }
    }

    // Assert
    const es = scenario.expectedEndState;
    const task = await prisma.cleaningTask.findUnique({ where: { id: taskId! } });
    expect(task!.status).toBe(es.taskStatus);
    expect(task!.scheduledStartAt.toISOString()).toBe(es.taskScheduledStartAt);
  });

  // ─── Scenario 3: Primary no-show → backup assignment ───

  it('primary no-show triggers backup assignment', async () => {
    const scenario = loadScenario('primary-no-show-backup.json');
    const taskIds: string[] = [];

    for (const step of scenario.steps) {
      if (step.action === 'booking.created' && step.booking) {
        const booking = await prisma.booking.create({
          data: {
            companyId,
            propertyId,
            startAt: new Date(step.booking.startAt!),
            endAt: new Date(step.booking.endAt!),
            status: 'booked',
            source: 'manual',
          },
        });
        createdBookingIds.push(booking.id);

        const r = await handleBookingEvent({
          companyId,
          bookingId: booking.id,
          propertyId,
          endAt: booking.endAt,
          cleaningDurationMinutes: 90,
          status: 'booked',
        });
        taskIds.push(r.taskId!);
        createdTaskIds.push(r.taskId!);
      } else if (step.action === 'dispatch') {
        const r = await dispatchTask(companyId, taskIds[step.taskIndex!]!);
        expect(r.success).toBe(true);
      } else if (step.action === 'simulate-no-show') {
        // Move scheduledStartAt and updatedAt back in time so the confirm deadline is past
        const tid = taskIds[step.taskIndex!]!;
        const pastTime = new Date(
          Date.now() - (triageConfig.CONFIRM_TIMEOUT_MINUTES + 60) * 60_000,
        );
        await prisma.cleaningTask.update({
          where: { id: tid },
          data: { scheduledStartAt: pastTime },
        });
      } else if (step.action === 'check-no-show') {
        const r = await checkForNoShows();
        expect(r.noShows).toBeGreaterThanOrEqual(1);
        // After no-show, backup should have been assigned (task back to 'assigned')
      } else if (step.action === 'accept') {
        const r = await acceptTask(companyId, taskIds[step.taskIndex!]!);
        expect(r.success).toBe(true);
      } else if (step.action === 'check-in') {
        const r = await checkInTask(companyId, taskIds[step.taskIndex!]!);
        expect(r.success).toBe(true);
      } else if (step.action === 'complete') {
        const r = await completeTask(companyId, taskIds[step.taskIndex!]!);
        expect(r.success).toBe(true);
      }
    }

    // Assert
    const es = scenario.expectedEndState;
    const task = await prisma.cleaningTask.findUnique({ where: { id: taskIds[0]! } });
    expect(task!.status).toBe(es.taskStatus);

    const noShowIncidents = await prisma.incident.findMany({
      where: { taskId: taskIds[0]!, type: 'NO_SHOW' },
    });
    expect(noShowIncidents.length).toBe(es.noShowIncidentCount);
  });

  // ─── Scenario 4: Cancel booking cancels task ───

  it('cancel booking cancels cleaning task', async () => {
    const scenario = loadScenario('cancel-booking-cancels-task.json');
    let bookingId: string | undefined;
    let taskId: string | undefined;

    for (const step of scenario.steps) {
      if (step.action === 'booking.created' && step.booking) {
        const booking = await prisma.booking.create({
          data: {
            companyId,
            propertyId,
            startAt: new Date(step.booking.startAt!),
            endAt: new Date(step.booking.endAt!),
            status: 'booked',
            source: 'manual',
          },
        });
        bookingId = booking.id;
        createdBookingIds.push(booking.id);

        const r = await handleBookingEvent({
          companyId,
          bookingId: booking.id,
          propertyId,
          endAt: booking.endAt,
          cleaningDurationMinutes: 90,
          status: 'booked',
        });
        expect(r.action).toBe('created');
        taskId = r.taskId!;
        createdTaskIds.push(taskId);
      } else if (step.action === 'booking.canceled') {
        const r = await handleBookingEvent({
          companyId,
          bookingId: bookingId!,
          propertyId,
          endAt: new Date('2026-10-04T11:00:00Z'), // original endAt
          cleaningDurationMinutes: 90,
          status: 'canceled',
        });
        expect(r.action).toBe('canceled');
      }
    }

    // Assert
    const es = scenario.expectedEndState;
    const task = await prisma.cleaningTask.findUnique({ where: { id: taskId! } });
    expect(task!.status).toBe(es.taskStatus);

    const incidents = await prisma.incident.findMany({
      where: { taskId: taskId! },
    });
    expect(incidents.length).toBe(es.incidentCount);
  });

  // ─── Scenario 5: No-show ladder escalation ───

  it('no-show ladder escalates through steps and produces correct events', async () => {
    const scenario = loadScenario('no-show-ladder-escalation.json');
    const taskIds: string[] = [];

    for (const step of scenario.steps) {
      if (step.action === 'booking.created' && step.booking) {
        const booking = await prisma.booking.create({
          data: {
            companyId,
            propertyId,
            startAt: new Date(step.booking.startAt!),
            endAt: new Date(step.booking.endAt!),
            status: 'booked',
            source: 'manual',
          },
        });
        createdBookingIds.push(booking.id);

        const r = await handleBookingEvent({
          companyId,
          bookingId: booking.id,
          propertyId,
          endAt: booking.endAt,
          cleaningDurationMinutes: 90,
          status: 'booked',
        });
        taskIds.push(r.taskId!);
        createdTaskIds.push(r.taskId!);
      } else if (step.action === 'dispatch') {
        const r = await dispatchTask(companyId, taskIds[step.taskIndex!]!);
        expect(r.success).toBe(true);
      } else if (step.action === 'simulate-late') {
        // Move scheduledStartAt back so the task appears N minutes late
        const tid = taskIds[step.taskIndex!]!;
        const pastStart = new Date(Date.now() - step.minutesLate! * 60_000);
        await prisma.cleaningTask.update({
          where: { id: tid },
          data: { scheduledStartAt: pastStart },
        });
      } else if (step.action === 'run-ladder') {
        await runNoShowLadder('eval-ladder');
      } else if (step.action === 'accept') {
        const r = await acceptTask(companyId, taskIds[step.taskIndex!]!);
        expect(r.success).toBe(true);
      } else if (step.action === 'check-in') {
        const r = await checkInTask(companyId, taskIds[step.taskIndex!]!);
        expect(r.success).toBe(true);
      } else if (step.action === 'complete') {
        const r = await completeTask(companyId, taskIds[step.taskIndex!]!);
        expect(r.success).toBe(true);
      }
    }

    // Assert end state
    const es = scenario.expectedEndState;
    expect(taskIds.length).toBe(es.taskCount);

    const task = await prisma.cleaningTask.findUnique({ where: { id: taskIds[0]! } });
    expect(task!.status).toBe(es.taskStatus);

    // Verify ladder events fired
    const remindEvents = await prisma.event.findMany({
      where: { type: 'ladder.remind_primary', entityId: taskIds[0]! },
    });
    expect(remindEvents.length).toBeGreaterThanOrEqual(1);

    const backupEvents = await prisma.event.findMany({
      where: { type: 'ladder.switch_backup', entityId: taskIds[0]! },
    });
    expect(backupEvents.length).toBeGreaterThanOrEqual(1);

    // Verify NO_SHOW incident
    const noShowIncidents = await prisma.incident.findMany({
      where: { taskId: taskIds[0]!, type: 'NO_SHOW' },
    });
    expect(noShowIncidents.length).toBe(es.noShowIncidentCount);
  });
});
