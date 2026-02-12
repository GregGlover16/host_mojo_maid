/**
 * Eval Harness Runner
 *
 * Resets the test DB, seeds deterministic data, runs all scenario scripts
 * through the real service stack, and produces eval/report.json.
 *
 * Usage: npx tsx eval/runner.ts
 */

// IMPORTANT: Set env BEFORE any imports so the config/logger module reads 'test'.
// Use a separate eval.db so we don't corrupt the test DB used by vitest.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./eval.db';
process.env.LOG_LEVEL = 'silent';

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { handleBookingEvent } from '../src/services/booking-handler.service';
import { dispatchTask, acceptTask, checkInTask, completeTask } from '../src/services/dispatch.service';
import { requestPayment } from '../src/services/payment.service';
import { checkForNoShows } from '../src/services/no-show.service';
import { runNoShowLadder } from '../src/services/no-show-ladder.service';
import { triageConfig } from '../src/config/triage';

interface ScenarioStep {
  action: string;
  taskIndex?: number;
  minutesLate?: number;
  booking?: {
    startAt?: string;
    endAt?: string;
    status?: string;
  };
}

interface ScenarioFile {
  name: string;
  description: string;
  steps: ScenarioStep[];
  expectedEndState: Record<string, unknown>;
}

interface ScenarioResult {
  name: string;
  status: 'pass' | 'fail';
  durationMs: number;
  assertions: AssertionResult[];
  error?: string;
}

interface AssertionResult {
  field: string;
  expected: unknown;
  actual: unknown;
  pass: boolean;
}

interface EvalReport {
  runAt: string;
  durationMs: number;
  scenarioCount: number;
  passCount: number;
  failCount: number;
  scenarios: ScenarioResult[];
}

function loadScenarios(): ScenarioFile[] {
  const scenariosDir = path.resolve(__dirname, 'scenarios');
  const files = fs.readdirSync(scenariosDir).filter((f) => f.endsWith('.json'));
  return files.map((f) => {
    const raw = fs.readFileSync(path.join(scenariosDir, f), 'utf-8');
    return JSON.parse(raw) as ScenarioFile;
  });
}

async function resetAndSeed(prisma: PrismaClient): Promise<void> {
  // Delete in dependency order
  await prisma.outbox.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.cleaningTask.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.cleaningManifest.deleteMany();
  await prisma.cleanerProperty.deleteMany();
  await prisma.property.deleteMany();
  await prisma.cleaner.deleteMany();
  await prisma.event.deleteMany();
  await prisma.company.deleteMany();

  // Deterministic seed: create two companies with cleaners, properties, and cleaner-property links
  const co1 = await prisma.company.create({
    data: { name: 'Eval PMC Alpha', marketRegion: 'Florida' },
  });

  const cleanerA1 = await prisma.cleaner.create({
    data: {
      companyId: co1.id,
      name: 'Alice Primary',
      phone: '555-0001',
      email: 'alice@eval.test',
      reliabilityScore: 95,
    },
  });

  const cleanerA2 = await prisma.cleaner.create({
    data: {
      companyId: co1.id,
      name: 'Bob Backup',
      phone: '555-0002',
      email: 'bob@eval.test',
      reliabilityScore: 85,
    },
  });

  const prop1 = await prisma.property.create({
    data: {
      companyId: co1.id,
      name: 'Eval Beach House',
      addressCity: 'Destin',
      addressState: 'FL',
      timezone: 'America/New_York',
      bedrooms: 3,
      bathrooms: 2,
      cleaningDurationMinutes: 90,
    },
  });

  // Primary cleaner
  await prisma.cleanerProperty.create({
    data: { cleanerId: cleanerA1.id, propertyId: prop1.id, priority: 1 },
  });

  // Backup cleaner
  await prisma.cleanerProperty.create({
    data: { cleanerId: cleanerA2.id, propertyId: prop1.id, priority: 2 },
  });
}

async function runScenario(
  prisma: PrismaClient,
  scenario: ScenarioFile,
  companyId: string,
  propertyId: string,
): Promise<ScenarioResult> {
  const start = performance.now();
  const bookingIds: string[] = [];
  const taskIds: string[] = [];
  const assertions: AssertionResult[] = [];

  try {
    for (const step of scenario.steps) {
      switch (step.action) {
        case 'booking.created': {
          const booking = await prisma.booking.create({
            data: {
              companyId,
              propertyId,
              startAt: new Date(step.booking!.startAt!),
              endAt: new Date(step.booking!.endAt!),
              status: 'booked',
              source: 'manual',
            },
          });
          bookingIds.push(booking.id);

          const result = await handleBookingEvent({
            companyId,
            bookingId: booking.id,
            propertyId,
            endAt: booking.endAt,
            cleaningDurationMinutes: 90,
            status: 'booked',
          });
          if (result.taskId) taskIds.push(result.taskId);
          break;
        }

        case 'booking.updated': {
          const lastBookingId = bookingIds[bookingIds.length - 1]!;
          await handleBookingEvent({
            companyId,
            bookingId: lastBookingId,
            propertyId,
            endAt: new Date(step.booking!.endAt!),
            cleaningDurationMinutes: 90,
            status: 'booked',
          });
          break;
        }

        case 'booking.canceled': {
          const cancelBookingId = bookingIds[bookingIds.length - 1]!;
          await handleBookingEvent({
            companyId,
            bookingId: cancelBookingId,
            propertyId,
            endAt: new Date('2026-10-04T11:00:00Z'),
            cleaningDurationMinutes: 90,
            status: 'canceled',
          });
          break;
        }

        case 'dispatch':
          await dispatchTask(companyId, taskIds[step.taskIndex!]!);
          break;

        case 'accept':
          await acceptTask(companyId, taskIds[step.taskIndex!]!);
          break;

        case 'check-in':
          await checkInTask(companyId, taskIds[step.taskIndex!]!);
          break;

        case 'complete':
          await completeTask(companyId, taskIds[step.taskIndex!]!);
          await requestPayment(companyId, taskIds[step.taskIndex!]!);
          break;

        case 'simulate-no-show': {
          const tid = taskIds[step.taskIndex!]!;
          const pastTime = new Date(
            Date.now() - (triageConfig.CONFIRM_TIMEOUT_MINUTES + 60) * 60_000,
          );
          await prisma.cleaningTask.update({
            where: { id: tid },
            data: { scheduledStartAt: pastTime },
          });
          break;
        }

        case 'check-no-show':
          await checkForNoShows();
          break;

        case 'simulate-late': {
          const tid = taskIds[step.taskIndex!]!;
          const pastStart = new Date(Date.now() - step.minutesLate! * 60_000);
          await prisma.cleaningTask.update({
            where: { id: tid },
            data: { scheduledStartAt: pastStart },
          });
          break;
        }

        case 'run-ladder':
          await runNoShowLadder('eval-runner');
          break;
      }
    }

    // Verify expected end state
    const es = scenario.expectedEndState;

    if (es.taskCount !== undefined) {
      assertions.push(assertField('taskCount', es.taskCount, taskIds.length));
    }

    if (es.allTasksStatus !== undefined) {
      for (let i = 0; i < taskIds.length; i++) {
        const task = await prisma.cleaningTask.findUnique({ where: { id: taskIds[i]! } });
        assertions.push(assertField(`task[${i}].status`, es.allTasksStatus, task?.status));
      }
    }

    if (es.taskStatus !== undefined && taskIds.length > 0) {
      const task = await prisma.cleaningTask.findUnique({ where: { id: taskIds[0]! } });
      assertions.push(assertField('taskStatus', es.taskStatus, task?.status));
    }

    if (es.incidentCount !== undefined) {
      const incidents = await prisma.incident.findMany({
        where: { taskId: { in: taskIds } },
      });
      assertions.push(assertField('incidentCount', es.incidentCount, incidents.length));
    }

    if (es.noShowIncidentCount !== undefined) {
      const noShows = await prisma.incident.findMany({
        where: { taskId: { in: taskIds }, type: 'NO_SHOW' },
      });
      assertions.push(assertField('noShowIncidentCount', es.noShowIncidentCount, noShows.length));
    }

    if (es.taskScheduledStartAt !== undefined && taskIds.length > 0) {
      const task = await prisma.cleaningTask.findUnique({ where: { id: taskIds[0]! } });
      assertions.push(
        assertField('taskScheduledStartAt', es.taskScheduledStartAt, task?.scheduledStartAt.toISOString()),
      );
    }

    if (es.ladderRemindPrimaryFired !== undefined && taskIds.length > 0) {
      const events = await prisma.event.findMany({
        where: { type: 'ladder.remind_primary', entityId: taskIds[0]! },
      });
      assertions.push(
        assertField('ladderRemindPrimaryFired', true, events.length >= 1),
      );
    }

    if (es.ladderSwitchBackupFired !== undefined && taskIds.length > 0) {
      const events = await prisma.event.findMany({
        where: { type: 'ladder.switch_backup', entityId: taskIds[0]! },
      });
      assertions.push(
        assertField('ladderSwitchBackupFired', true, events.length >= 1),
      );
    }

    const allPassed = assertions.every((a) => a.pass);
    return {
      name: scenario.name,
      status: allPassed ? 'pass' : 'fail',
      durationMs: Math.round(performance.now() - start),
      assertions,
    };
  } catch (err: unknown) {
    return {
      name: scenario.name,
      status: 'fail',
      durationMs: Math.round(performance.now() - start),
      assertions,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function assertField(field: string, expected: unknown, actual: unknown): AssertionResult {
  return { field, expected, actual, pass: expected === actual };
}

async function main() {
  const overallStart = performance.now();
  const prisma = new PrismaClient();

  try {
    // Push schema to eval.db (creates tables if they don't exist)
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      env: { ...process.env, DATABASE_URL: 'file:./eval.db' },
      stdio: 'pipe',
    });

    await prisma.$connect();

    // 1. Reset and seed
    console.log('Resetting DB and seeding deterministic data...');
    await resetAndSeed(prisma);

    // Get the seeded company/property
    const company = await prisma.company.findFirst({ orderBy: { name: 'asc' } });
    if (!company) throw new Error('Seed failed: no company found');
    const property = await prisma.property.findFirst({ where: { companyId: company.id } });
    if (!property) throw new Error('Seed failed: no property found');

    // 2. Load scenarios
    const scenarios = loadScenarios();
    console.log(`Running ${scenarios.length} eval scenarios...\n`);

    // 3. Run each scenario (reset tasks/bookings between scenarios to avoid cross-contamination)
    const results: ScenarioResult[] = [];

    for (const scenario of scenarios) {
      // Clean task-level data between scenarios
      await prisma.outbox.deleteMany();
      await prisma.incident.deleteMany();
      await prisma.cleaningTask.deleteMany();
      await prisma.booking.deleteMany();
      await prisma.event.deleteMany();

      const result = await runScenario(prisma, scenario, company.id, property.id);
      results.push(result);

      const icon = result.status === 'pass' ? 'PASS' : 'FAIL';
      console.log(`  [${icon}] ${scenario.name} (${result.durationMs}ms)`);
      if (result.error) {
        console.log(`         Error: ${result.error}`);
      }
      for (const a of result.assertions.filter((a) => !a.pass)) {
        console.log(`         FAIL: ${a.field} expected=${JSON.stringify(a.expected)} actual=${JSON.stringify(a.actual)}`);
      }
    }

    // 4. Produce report
    const report: EvalReport = {
      runAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - overallStart),
      scenarioCount: results.length,
      passCount: results.filter((r) => r.status === 'pass').length,
      failCount: results.filter((r) => r.status === 'fail').length,
      scenarios: results,
    };

    const reportPath = path.resolve(__dirname, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    console.log(`\n${report.passCount}/${report.scenarioCount} scenarios passed.`);
    console.log(`Report written to: ${reportPath}`);
    console.log(`Total duration: ${report.durationMs}ms`);

    // Exit code 1 if any failures
    if (report.failCount > 0) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Eval runner failed:', err);
  process.exit(1);
});
