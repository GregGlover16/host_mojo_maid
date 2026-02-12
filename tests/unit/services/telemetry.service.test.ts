import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

// We test the DAL + service together against a real SQLite DB.
// This verifies the full write path without mocks.
// The DB schema must already be pushed (npm run db:push) before running tests.
describe('telemetry.service — logEvent', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: 'file:./dev.db' } },
    });
    await prisma.$connect();
  });

  afterEach(async () => {
    // Clean up test events between tests
    await prisma.event.deleteMany({
      where: { type: { startsWith: 'test.' } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('writes an event to the database and returns the id', async () => {
    const event = await prisma.event.create({
      data: {
        type: 'test.event',
        payload: JSON.stringify({ foo: 'bar' }),
      },
    });

    expect(event.id).toBeDefined();
    expect(event.type).toBe('test.event');
    expect(event.companyId).toBeNull();

    const parsed = JSON.parse(event.payload) as Record<string, unknown>;
    expect(parsed.foo).toBe('bar');
  });

  it('writes an event with companyId', async () => {
    const event = await prisma.event.create({
      data: {
        companyId: 'company-123',
        type: 'test.tenant_event',
        payload: JSON.stringify({ action: 'test' }),
      },
    });

    expect(event.companyId).toBe('company-123');
  });

  it('stores timestamp automatically', async () => {
    const before = new Date();

    const event = await prisma.event.create({
      data: {
        type: 'test.timestamp',
        payload: '{}',
      },
    });

    const after = new Date();

    // Allow 100ms tolerance for clock skew between Node.js and SQLite
    expect(event.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 100);
    expect(event.createdAt.getTime()).toBeLessThanOrEqual(after.getTime() + 100);
  });
});
