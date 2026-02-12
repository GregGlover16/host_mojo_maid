// Prisma seed script — Phase 1: realistic synthetic data for 2 PMCs.
// Run with: npm run db:seed

import { PrismaClient } from '@prisma/client';
import { v4 as uuid } from 'uuid';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a Date at the given hour on a specific day (UTC). */
function dateAtHour(baseDate: Date, hour: number, minute = 0): Date {
  const d = new Date(baseDate);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

/** Add days to a date. */
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Pick a random element from an array. */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Pick a random integer between min and max (inclusive). */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Data definitions
// ---------------------------------------------------------------------------

interface CompanyDef {
  id: string;
  name: string;
  marketRegion: string;
  timezone: string;
  state: string;
  cities: string[];
}

const COMPANIES: CompanyDef[] = [
  {
    id: uuid(),
    name: 'Pine Coast PM',
    marketRegion: 'Maine',
    timezone: 'America/New_York',
    state: 'ME',
    cities: ['Portland', 'Bar Harbor', 'Kennebunkport', 'Camden', 'Boothbay Harbor'],
  },
  {
    id: uuid(),
    name: 'Sunshine Ops',
    marketRegion: 'Orlando',
    timezone: 'America/New_York',
    state: 'FL',
    cities: ['Orlando', 'Kissimmee', 'Davenport', 'Celebration', 'Winter Garden'],
  },
];

const MAINE_PROPERTY_NAMES = [
  'Lighthouse Cove Cottage',
  'Harbor View Suite',
  'Acadia Pines Cabin',
  'Old Port Loft',
  'Seaside Retreat',
  "Captain's Quarters",
  'Birch Haven',
  'Lobster Shack Studio',
  'Bayview Bungalow',
  'Tidal Pool House',
];

const ORLANDO_PROPERTY_NAMES = [
  'Magic Kingdom Villa',
  'Lakefront Paradise',
  'Palm Breeze Condo',
  'Theme Park Escape',
  'Sunshine Studio',
  'Cypress Creek House',
  'Orlando Gateway Suite',
  'Tropical Oasis',
  'Starlight Manor',
  'Orange Grove Retreat',
];

interface CleanerDef {
  name: string;
  phone: string;
  email: string;
  reliabilityScore: number;
}

const MAINE_CLEANERS: CleanerDef[] = [
  { name: 'Sarah Mitchell', phone: '207-555-0101', email: 'sarah.m@example.com', reliabilityScore: 95 },
  { name: 'Jake Thompson', phone: '207-555-0102', email: 'jake.t@example.com', reliabilityScore: 88 },
  { name: 'Linda Chen', phone: '207-555-0103', email: 'linda.c@example.com', reliabilityScore: 92 },
  { name: 'Marcus Rivera', phone: '207-555-0104', email: 'marcus.r@example.com', reliabilityScore: 78 },
  { name: 'Amy Dubois', phone: '207-555-0105', email: 'amy.d@example.com', reliabilityScore: 97 },
];

const ORLANDO_CLEANERS: CleanerDef[] = [
  { name: 'Rosa Hernandez', phone: '407-555-0201', email: 'rosa.h@example.com', reliabilityScore: 96 },
  { name: 'Dwayne Carter', phone: '407-555-0202', email: 'dwayne.c@example.com', reliabilityScore: 85 },
  { name: 'Priya Patel', phone: '407-555-0203', email: 'priya.p@example.com', reliabilityScore: 91 },
  { name: 'Carlos Vega', phone: '407-555-0204', email: 'carlos.v@example.com', reliabilityScore: 82 },
  { name: "Megan O'Brien", phone: '407-555-0205', email: 'megan.o@example.com', reliabilityScore: 94 },
  { name: 'Kevin Nguyen', phone: '407-555-0206', email: 'kevin.n@example.com', reliabilityScore: 89 },
];

const BOOKING_SOURCES = ['pms', 'ota', 'manual'] as const;
const VENDORS = ['none', 'none', 'none', 'none', 'turno', 'turno', 'turno', 'breezeway', 'breezeway', 'handy'] as const;

/** Generate a fake vendor task ID (e.g., "TRN-a3f29e" or "BRZ-d491c1"). */
function fakeVendorTaskId(vendor: string): string | null {
  if (vendor === 'none') return null;
  const prefix = vendor === 'turno' ? 'TRN' : vendor === 'breezeway' ? 'BRZ' : 'HND';
  const hex = Math.random().toString(16).slice(2, 8);
  return `${prefix}-${hex}`;
}

// ---------------------------------------------------------------------------
// Main seed
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('Seeding Phase 1 data...');

  // Clear existing data (order matters due to FKs)
  await prisma.incident.deleteMany();
  await prisma.outbox.deleteMany();
  await prisma.cleaningTask.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.cleanerProperty.deleteMany();
  await prisma.cleaner.deleteMany();
  await prisma.property.deleteMany();
  await prisma.company.deleteMany();
  await prisma.event.deleteMany();

  const now = new Date();

  for (const compDef of COMPANIES) {
    // --- Company ---
    const company = await prisma.company.create({
      data: {
        id: compDef.id,
        name: compDef.name,
        marketRegion: compDef.marketRegion,
      },
    });

    const propertyNames =
      compDef.marketRegion === 'Maine' ? MAINE_PROPERTY_NAMES : ORLANDO_PROPERTY_NAMES;
    const cleanerDefs =
      compDef.marketRegion === 'Maine' ? MAINE_CLEANERS : ORLANDO_CLEANERS;

    // --- Cleaners ---
    const cleanerIds: string[] = [];
    for (const cDef of cleanerDefs) {
      const cleaner = await prisma.cleaner.create({
        data: {
          companyId: company.id,
          name: cDef.name,
          phone: cDef.phone,
          email: cDef.email,
          reliabilityScore: cDef.reliabilityScore,
        },
      });
      cleanerIds.push(cleaner.id);
    }

    // --- Properties ---
    const propertyIds: string[] = [];
    for (let p = 0; p < 10; p++) {
      const bedrooms = randInt(1, 5);
      const bathrooms = Math.min(bedrooms, randInt(1, 3));
      // Duration scales with size: ~60 min for 1BR up to ~150 for 5BR
      const cleaningDuration = 60 + (bedrooms - 1) * 20 + (bathrooms - 1) * 10;

      const prop = await prisma.property.create({
        data: {
          companyId: company.id,
          name: propertyNames[p]!,
          addressCity: compDef.cities[p % compDef.cities.length]!,
          addressState: compDef.state,
          timezone: compDef.timezone,
          bedrooms,
          bathrooms,
          standardCheckinTime: '16:00',
          standardCheckoutTime: '11:00',
          cleaningDurationMinutes: cleaningDuration,
          defaultCleanerId: cleanerIds[p % cleanerIds.length]!,
        },
      });
      propertyIds.push(prop.id);

      // Map primary cleaner (the default) and a backup
      const primaryIdx = p % cleanerIds.length;
      const backupIdx = (p + 1) % cleanerIds.length;

      await prisma.cleanerProperty.create({
        data: {
          cleanerId: cleanerIds[primaryIdx]!,
          propertyId: prop.id,
          priority: 1,
        },
      });
      await prisma.cleanerProperty.create({
        data: {
          cleanerId: cleanerIds[backupIdx]!,
          propertyId: prop.id,
          priority: 2,
        },
      });
    }

    // --- Bookings & Cleaning Tasks ---
    // Generate bookings from 60 days ago to 30 days from now.
    // Each property gets a series of bookings with gaps and back-to-backs.
    const rangeStart = addDays(now, -60);

    let extensionDone = false; // one extension per company
    let cancelCount = 0;

    for (const propId of propertyIds) {
      // Fetch the property for its cleaning duration
      const prop = await prisma.property.findUniqueOrThrow({ where: { id: propId } });

      let cursor = new Date(rangeStart);
      cursor = dateAtHour(cursor, 16); // check-in at 16:00

      while (cursor < addDays(now, 30)) {
        const stayLength = randInt(2, 7); // 2–7 night stay
        const checkIn = new Date(cursor);
        const checkOut = addDays(dateAtHour(checkIn, 11), stayLength); // checkout at 11:00

        // Decide if this booking is canceled (~10%)
        const isCanceled = Math.random() < 0.1;
        const status = isCanceled ? 'canceled' : 'booked';
        if (isCanceled) cancelCount++;

        // Extension pattern: extend one booking by 2 days per company
        let actualCheckOut = checkOut;
        let isExtension = false;
        if (!extensionDone && !isCanceled && cursor > addDays(now, -30)) {
          actualCheckOut = addDays(checkOut, 2);
          extensionDone = true;
          isExtension = true;
        }

        const booking = await prisma.booking.create({
          data: {
            companyId: company.id,
            propertyId: propId,
            startAt: checkIn,
            endAt: actualCheckOut,
            status,
            source: pick([...BOOKING_SOURCES]),
            // For extension, set updatedAt to simulate a later change
            ...(isExtension ? { updatedAt: addDays(checkIn, 1) } : {}),
          },
        });

        // Create cleaning task for non-canceled bookings
        if (!isCanceled) {
          const taskStart = new Date(actualCheckOut); // starts at checkout time (11:00)
          const taskEnd = new Date(taskStart);
          taskEnd.setUTCMinutes(taskEnd.getUTCMinutes() + prop.cleaningDurationMinutes);

          // Determine task status based on whether checkout is past
          const isPast = actualCheckOut < now;
          // ~85% of past tasks completed on time, ~10% completed late, ~5% failed
          let taskStatus: string;
          let completedAt: Date | null = null;
          let paymentStatus = 'none';
          let paymentAmountCents = 0;

          if (isPast) {
            const roll = Math.random();
            if (roll < 0.85) {
              taskStatus = 'completed';
              // Completed within the window (on time)
              completedAt = new Date(taskStart);
              completedAt.setUTCMinutes(
                completedAt.getUTCMinutes() + randInt(30, prop.cleaningDurationMinutes - 5),
              );
              paymentStatus = 'paid';
              paymentAmountCents = randInt(80, 200) * 100; // $80–$200
            } else if (roll < 0.95) {
              taskStatus = 'completed';
              // Completed late (after scheduled end)
              completedAt = new Date(taskEnd);
              completedAt.setUTCMinutes(completedAt.getUTCMinutes() + randInt(10, 45));
              paymentStatus = 'paid';
              paymentAmountCents = randInt(80, 200) * 100;
            } else {
              taskStatus = 'failed';
              paymentStatus = 'none';
            }
          } else {
            taskStatus = 'scheduled';
          }

          // Pick the primary cleaner for this property
          const primaryLink = await prisma.cleanerProperty.findFirst({
            where: { propertyId: propId, priority: 1 },
          });

          const vendor = pick([...VENDORS]);
          await prisma.cleaningTask.create({
            data: {
              companyId: company.id,
              propertyId: propId,
              bookingId: booking.id,
              scheduledStartAt: taskStart,
              scheduledEndAt: taskEnd,
              status: taskStatus,
              assignedCleanerId:
                taskStatus !== 'scheduled' ? (primaryLink?.cleanerId ?? null) : null,
              vendor,
              vendorTaskId: fakeVendorTaskId(vendor),
              paymentAmountCents,
              paymentStatus,
              completedAt,
            },
          });
        }

        // Next booking: either back-to-back (30%) or gap of 1–3 days
        const isBackToBack = Math.random() < 0.3;
        if (isBackToBack) {
          cursor = dateAtHour(actualCheckOut, 16); // same day check-in
        } else {
          cursor = dateAtHour(addDays(actualCheckOut, randInt(1, 3)), 16);
        }
      }
    }

    // --- Guarantee at least one failed task per company (for NO_SHOW incident) ---
    const existingFailed = await prisma.cleaningTask.count({
      where: { companyId: company.id, status: 'failed' },
    });
    if (existingFailed === 0) {
      // Flip the earliest completed task to failed
      const firstCompleted = await prisma.cleaningTask.findFirst({
        where: { companyId: company.id, status: 'completed' },
        orderBy: { scheduledStartAt: 'asc' },
      });
      if (firstCompleted) {
        await prisma.cleaningTask.update({
          where: { id: firstCompleted.id },
          data: { status: 'failed', completedAt: null, paymentStatus: 'none', paymentAmountCents: 0 },
        });
      }
    }

    // --- Incidents ---
    // Grab some completed/failed tasks for this company to attach incidents to
    const failedTasks = await prisma.cleaningTask.findMany({
      where: { companyId: company.id, status: 'failed' },
      take: 2,
    });
    const completedTasks = await prisma.cleaningTask.findMany({
      where: { companyId: company.id, status: 'completed' },
      take: 5,
    });

    // NO_SHOW on a failed task
    if (failedTasks[0]) {
      await prisma.incident.create({
        data: {
          companyId: company.id,
          propertyId: failedTasks[0].propertyId,
          taskId: failedTasks[0].id,
          type: 'NO_SHOW',
          severity: 'high',
          description:
            'Cleaner did not arrive. Guest checkout was at 11:00, no contact from cleaner by 12:30.',
        },
      });
    }

    // DAMAGE on a completed task
    if (completedTasks[0]) {
      await prisma.incident.create({
        data: {
          companyId: company.id,
          propertyId: completedTasks[0].propertyId,
          taskId: completedTasks[0].id,
          type: 'DAMAGE',
          severity: 'med',
          description:
            'Broken towel rack in master bathroom. Photos uploaded. Replacement ordered.',
        },
      });
    }

    // SUPPLIES on a completed task
    if (completedTasks[1]) {
      await prisma.incident.create({
        data: {
          companyId: company.id,
          propertyId: completedTasks[1].propertyId,
          taskId: completedTasks[1].id,
          type: 'SUPPLIES',
          severity: 'low',
          description:
            'Low on toilet paper and dish soap. Restocked from emergency supply kit.',
        },
      });
    }

    // eslint-disable-next-line no-console
    console.log(
      `  Company "${company.name}" seeded: 10 properties, ${cleanerDefs.length} cleaners, ~${cancelCount} canceled bookings`,
    );
    cancelCount = 0;
  }

  // ── UI Demo Scenarios (today) ──
  // Create deterministic turnovers for today so the UI has good demo data:
  // - 10 active turnovers (mix of statuses)
  // - 3 late cleaners (assigned but past start, no confirmation)
  // - 2 no-shows (failed)
  // - 2 emergency clean scenarios
  // - 5 completed + verified (with placeholder photo URLs)
  // eslint-disable-next-line no-console
  console.log('  Creating today\'s demo turnovers...');

  for (const compDef of COMPANIES) {
    const company = await prisma.company.findFirst({ where: { name: compDef.name } });
    if (!company) continue;

    const props = await prisma.property.findMany({
      where: { companyId: company.id },
      take: 10,
    });
    const cleaners = await prisma.cleaner.findMany({
      where: { companyId: company.id },
    });
    if (props.length === 0 || cleaners.length === 0) continue;

    const today = new Date();

    // Helper: create a booking + task for a property at a specific time/status
    async function createDemoTurnover(opts: {
      propIdx: number;
      cleanerIdx: number;
      startHourOffset: number; // hours from now (negative = past)
      durationMin: number;
      status: string;
      confirmed: boolean;
      completed: boolean;
      paymentStatus?: string;
      paymentCents?: number;
      vendor?: string;
    }) {
      const prop = props[opts.propIdx % props.length]!;
      const cleaner = cleaners[opts.cleanerIdx % cleaners.length]!;
      const taskStart = new Date(today);
      taskStart.setUTCHours(taskStart.getUTCHours() + opts.startHourOffset);
      const taskEnd = new Date(taskStart);
      taskEnd.setUTCMinutes(taskEnd.getUTCMinutes() + opts.durationMin);

      const bookingStart = addDays(taskStart, -3);
      const bookingEnd = new Date(taskStart);

      const booking = await prisma.booking.create({
        data: {
          companyId: company!.id,
          propertyId: prop.id,
          startAt: bookingStart,
          endAt: bookingEnd,
          status: 'booked',
          source: 'pms',
        },
      });

      const taskVendor = opts.vendor ?? pick([...VENDORS]);
      const task = await prisma.cleaningTask.create({
        data: {
          companyId: company!.id,
          propertyId: prop.id,
          bookingId: booking.id,
          scheduledStartAt: taskStart,
          scheduledEndAt: taskEnd,
          status: opts.status,
          assignedCleanerId: opts.status !== 'scheduled' ? cleaner.id : null,
          confirmedAt: opts.confirmed ? new Date(taskStart.getTime() - 30 * 60_000) : null,
          completedAt: opts.completed ? new Date(taskEnd.getTime() + 5 * 60_000) : null,
          vendor: taskVendor,
          vendorTaskId: fakeVendorTaskId(taskVendor),
          paymentAmountCents: opts.paymentCents ?? 0,
          paymentStatus: opts.paymentStatus ?? 'none',
        },
      });

      return task;
    }

    // 5 completed + verified turnovers (morning, already done)
    for (let i = 0; i < 5; i++) {
      const task = await createDemoTurnover({
        propIdx: i,
        cleanerIdx: i,
        startHourOffset: -6 + i, // started 6–2 hours ago
        durationMin: props[i % props.length]!.cleaningDurationMinutes,
        status: 'completed',
        confirmed: true,
        completed: true,
        paymentStatus: 'paid',
        paymentCents: randInt(100, 180) * 100,
      });
      // Add outbox row to simulate photo verification
      await prisma.outbox.create({
        data: {
          companyId: company.id,
          type: 'notification.sms',
          payloadJson: JSON.stringify({
            message: `Cleaning verified with photos for ${props[i % props.length]!.name}`,
            photoUrls: [
              `https://placeholder.hostmojo.com/photos/${task.id}/kitchen.jpg`,
              `https://placeholder.hostmojo.com/photos/${task.id}/bathroom.jpg`,
              `https://placeholder.hostmojo.com/photos/${task.id}/bedroom.jpg`,
            ],
          }),
          idempotencyKey: `demo-verify-${task.id}`,
          status: 'sent',
          attempts: 1,
        },
      });
    }

    // 2 currently in-progress turnovers (one Turno, one In-House)
    const inProgressVendors = ['turno', 'none'];
    for (let i = 0; i < 2; i++) {
      await createDemoTurnover({
        propIdx: 5 + i,
        cleanerIdx: i + 2,
        startHourOffset: -1, // started 1 hour ago
        durationMin: 90,
        status: 'in_progress',
        confirmed: true,
        completed: false,
        vendor: inProgressVendors[i],
      });
    }

    // 3 late cleaners (assigned, past start time, no confirmation)
    const lateVendors = ['breezeway', 'none', 'handy'];
    for (let i = 0; i < 3; i++) {
      await createDemoTurnover({
        propIdx: 7 + (i % 3),
        cleanerIdx: i + 3,
        startHourOffset: -(1 + i * 0.5), // 1, 1.5, 2 hours past
        durationMin: 90,
        status: 'assigned',
        confirmed: false, // No confirmation = at_risk
        completed: false,
        vendor: lateVendors[i],
      });
    }

    // 2 no-show (failed) tasks with incidents (one Turno, one In-House)
    const noShowVendors = ['turno', 'none'];
    for (let i = 0; i < 2; i++) {
      const task = await createDemoTurnover({
        propIdx: i + 2,
        cleanerIdx: i,
        startHourOffset: -3, // 3 hours ago
        durationMin: 90,
        status: 'failed',
        confirmed: false,
        completed: false,
        vendor: noShowVendors[i],
      });
      await prisma.incident.create({
        data: {
          companyId: company.id,
          propertyId: task.propertyId,
          taskId: task.id,
          type: 'NO_SHOW',
          severity: 'high',
          description: `Cleaner did not arrive for today's turnover at ${props[task.propertyId === props[0]!.id ? 0 : (i + 2) % props.length]!.name}. Guest checking in at 4 PM.`,
        },
      });
    }

    // 2 emergency clean scenarios (outbox records)
    for (let i = 0; i < 2; i++) {
      const propForEmergency = props[(8 + i) % props.length]!;
      const emergencyNeededBy = new Date(today);
      emergencyNeededBy.setUTCHours(emergencyNeededBy.getUTCHours() + 2 + i);

      // Create incident for emergency
      const emergTask = await prisma.cleaningTask.findFirst({
        where: { companyId: company.id, propertyId: propForEmergency.id, status: 'failed' },
      });

      if (emergTask) {
        await prisma.incident.create({
          data: {
            companyId: company.id,
            propertyId: propForEmergency.id,
            taskId: emergTask.id,
            type: 'OTHER',
            severity: 'high',
            description: `Emergency cleaning requested for ${propForEmergency.name}. Guest arriving soon.`,
          },
        });
        await prisma.outbox.create({
          data: {
            companyId: company.id,
            type: 'emergency_clean_request',
            payloadJson: JSON.stringify({
              propertyId: propForEmergency.id,
              propertyName: propForEmergency.name,
              neededBy: emergencyNeededBy.toISOString(),
              reason: 'Cleaner no-show with guest arriving soon',
            }),
            idempotencyKey: `demo-emergency-${propForEmergency.id}-${i}`,
            status: 'pending',
            attempts: 0,
          },
        });
      }
    }

    // eslint-disable-next-line no-console
    console.log(`  Company "${company.name}": added demo turnovers for today.`);
  }

  // Seed completion telemetry event
  await prisma.event.create({
    data: {
      type: 'seed.completed',
      payload: JSON.stringify({ phase: 'ui-demo', message: 'Phase UI seed ran successfully' }),
    },
  });

  // eslint-disable-next-line no-console
  console.log('Seed completed.');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
