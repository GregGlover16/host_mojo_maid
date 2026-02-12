import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { handleBookingEvent } from '@/services/booking-handler.service';

/**
 * BookingHandler tests. These use the global prisma singleton (test.db)
 * because the service module imports it directly. We query test.db for
 * valid company/property IDs from seeded data.
 */
describe('BookingHandler service', () => {
  // Use the SAME db the services use — test.db (set by tests/setup.ts)
  let prisma: PrismaClient;
  let companyId: string;
  let propertyId: string;
  const createdBookingIds: string[] = [];
  const createdTaskIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL || 'file:./test.db' } },
    });
    await prisma.$connect();

    const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
    companyId = companies[0]!.id;

    const property = await prisma.property.findFirst({ where: { companyId } });
    propertyId = property!.id;
  });

  afterAll(async () => {
    // Clean up: tasks first (FK), then bookings
    if (createdTaskIds.length > 0) {
      await prisma.incident.deleteMany({ where: { taskId: { in: createdTaskIds } } });
      await prisma.cleaningTask.deleteMany({ where: { id: { in: createdTaskIds } } });
    }
    if (createdBookingIds.length > 0) {
      await prisma.booking.deleteMany({ where: { id: { in: createdBookingIds } } });
    }
    await prisma.$disconnect();
  });

  it('creates a cleaning task for a new booking', async () => {
    const booking = await prisma.booking.create({
      data: {
        companyId,
        propertyId,
        startAt: new Date('2026-11-01T16:00:00Z'),
        endAt: new Date('2026-11-05T11:00:00Z'),
        status: 'booked',
        source: 'manual',
      },
    });
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
    expect(result.taskId).toBeDefined();
    createdTaskIds.push(result.taskId!);

    const task = await prisma.cleaningTask.findUnique({ where: { id: result.taskId! } });
    expect(task!.companyId).toBe(companyId);
    expect(task!.propertyId).toBe(propertyId);
    expect(task!.bookingId).toBe(booking.id);
    expect(task!.status).toBe('scheduled');
    expect(task!.scheduledStartAt.getTime()).toBe(booking.endAt.getTime());
  });

  it('returns no_op when task already exists for booking', async () => {
    const booking = await prisma.booking.create({
      data: {
        companyId,
        propertyId,
        startAt: new Date('2026-11-10T16:00:00Z'),
        endAt: new Date('2026-11-14T11:00:00Z'),
        status: 'booked',
        source: 'manual',
      },
    });
    createdBookingIds.push(booking.id);

    const r1 = await handleBookingEvent({
      companyId,
      bookingId: booking.id,
      propertyId,
      endAt: booking.endAt,
      cleaningDurationMinutes: 90,
      status: 'booked',
    });
    expect(r1.action).toBe('created');
    createdTaskIds.push(r1.taskId!);

    const r2 = await handleBookingEvent({
      companyId,
      bookingId: booking.id,
      propertyId,
      endAt: booking.endAt,
      cleaningDurationMinutes: 90,
      status: 'booked',
    });
    expect(r2.action).toBe('no_op');
  });

  it('cancels task when booking is canceled', async () => {
    const booking = await prisma.booking.create({
      data: {
        companyId,
        propertyId,
        startAt: new Date('2026-11-20T16:00:00Z'),
        endAt: new Date('2026-11-24T11:00:00Z'),
        status: 'booked',
        source: 'manual',
      },
    });
    createdBookingIds.push(booking.id);

    const r1 = await handleBookingEvent({
      companyId,
      bookingId: booking.id,
      propertyId,
      endAt: booking.endAt,
      cleaningDurationMinutes: 90,
      status: 'booked',
    });
    createdTaskIds.push(r1.taskId!);

    const r2 = await handleBookingEvent({
      companyId,
      bookingId: booking.id,
      propertyId,
      endAt: booking.endAt,
      cleaningDurationMinutes: 90,
      status: 'canceled',
    });

    expect(r2.action).toBe('canceled');
    expect(r2.taskId).toBe(r1.taskId);

    const task = await prisma.cleaningTask.findUnique({ where: { id: r1.taskId! } });
    expect(task!.status).toBe('canceled');
  });

  it('reschedules task when booking endAt changes', async () => {
    const booking = await prisma.booking.create({
      data: {
        companyId,
        propertyId,
        startAt: new Date('2026-12-01T16:00:00Z'),
        endAt: new Date('2026-12-05T11:00:00Z'),
        status: 'booked',
        source: 'manual',
      },
    });
    createdBookingIds.push(booking.id);

    const r1 = await handleBookingEvent({
      companyId,
      bookingId: booking.id,
      propertyId,
      endAt: booking.endAt,
      cleaningDurationMinutes: 90,
      status: 'booked',
    });
    createdTaskIds.push(r1.taskId!);

    const newEndAt = new Date('2026-12-07T11:00:00Z');
    const r2 = await handleBookingEvent({
      companyId,
      bookingId: booking.id,
      propertyId,
      endAt: newEndAt,
      cleaningDurationMinutes: 90,
      status: 'booked',
    });

    expect(r2.action).toBe('rescheduled');
    expect(r2.taskId).toBe(r1.taskId);

    const task = await prisma.cleaningTask.findUnique({ where: { id: r1.taskId! } });
    expect(task!.scheduledStartAt.getTime()).toBe(newEndAt.getTime());
  });
});
