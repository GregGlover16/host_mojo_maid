import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Tests run against a pre-seeded dev.db.
// The seed must have been run before these tests (npm run db:seed).
describe('Phase 1 seed validation', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: 'file:./dev.db' } },
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates exactly 2 companies', async () => {
    const companies = await prisma.company.findMany();
    expect(companies).toHaveLength(2);

    const names = companies.map((c) => c.name).sort();
    expect(names).toEqual(['Pine Coast PM', 'Sunshine Ops']);
  });

  it('creates exactly 20 properties (10 per company)', async () => {
    const properties = await prisma.property.findMany();
    expect(properties).toHaveLength(20);

    const companies = await prisma.company.findMany();
    for (const company of companies) {
      const companyProps = properties.filter((p) => p.companyId === company.id);
      expect(companyProps).toHaveLength(10);
    }
  });

  it('creates at least 1 booking per property', async () => {
    const properties = await prisma.property.findMany();
    for (const prop of properties) {
      const count = await prisma.booking.count({
        where: { propertyId: prop.id },
      });
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  it('creates cleaning tasks for every non-canceled booking', async () => {
    const activeBookings = await prisma.booking.findMany({
      where: { status: 'booked' },
    });

    for (const booking of activeBookings) {
      const task = await prisma.cleaningTask.findFirst({
        where: { bookingId: booking.id },
      });
      expect(task).not.toBeNull();
    }
  });

  it('does NOT create cleaning tasks for canceled bookings', async () => {
    const canceledBookings = await prisma.booking.findMany({
      where: { status: 'canceled' },
    });

    // There should be at least some canceled bookings from the ~10% cancellation rate
    expect(canceledBookings.length).toBeGreaterThan(0);

    for (const booking of canceledBookings) {
      const task = await prisma.cleaningTask.findFirst({
        where: { bookingId: booking.id },
      });
      expect(task).toBeNull();
    }
  });

  it('creates 4–6 cleaners per company', async () => {
    const companies = await prisma.company.findMany();
    for (const company of companies) {
      const count = await prisma.cleaner.count({
        where: { companyId: company.id },
      });
      expect(count).toBeGreaterThanOrEqual(4);
      expect(count).toBeLessThanOrEqual(6);
    }
  });

  it('maps each property to a primary and backup cleaner', async () => {
    const properties = await prisma.property.findMany();
    for (const prop of properties) {
      const links = await prisma.cleanerProperty.findMany({
        where: { propertyId: prop.id },
      });
      const priorities = links.map((l) => l.priority).sort();
      expect(priorities).toEqual([1, 2]);
    }
  });

  it('creates at least one NO_SHOW incident per company', async () => {
    const companies = await prisma.company.findMany();
    for (const company of companies) {
      const count = await prisma.incident.count({
        where: { companyId: company.id, type: 'NO_SHOW' },
      });
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  it('creates at least one DAMAGE incident', async () => {
    const count = await prisma.incident.count({
      where: { type: 'DAMAGE' },
    });
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('creates at least one SUPPLIES incident', async () => {
    const count = await prisma.incident.count({
      where: { type: 'SUPPLIES' },
    });
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('includes at least one extension booking (updatedAt != createdAt)', async () => {
    const bookings = await prisma.booking.findMany({
      where: { status: 'booked' },
    });

    // An extension booking will have updatedAt significantly different from createdAt
    const extensions = bookings.filter(
      (b) => Math.abs(b.updatedAt.getTime() - b.createdAt.getTime()) > 60_000,
    );
    expect(extensions.length).toBeGreaterThanOrEqual(1);
  });
});
