import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '@/app';
import type { FastifyInstance } from 'fastify';

const DB_URL = process.env.DATABASE_URL || 'file:./test.db';

describe('Phase 4 API routes', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let companyId: string;
  let propertyId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    await prisma.$connect();

    app = buildApp();
    await app.ready();

    // Use the SECOND company to avoid concurrent test conflicts
    const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
    companyId = companies[1]!.id;
    const property = await prisma.property.findFirst({ where: { companyId } });
    propertyId = property!.id;
  });

  afterAll(async () => {
    await prisma.cleaningManifest.deleteMany({ where: { companyId } });
    await prisma.event.deleteMany({ where: { type: 'emergency.clean_requested' } });
    await app.close();
    await prisma.$disconnect();
  });

  // ── Cleaning Manifest ──

  it('GET /cleaning-manifest returns a default manifest', async () => {
    // Clear any existing manifest
    await prisma.cleaningManifest.deleteMany({ where: { propertyId } });

    const res = await app.inject({
      method: 'GET',
      url: `/companies/${companyId}/properties/${propertyId}/cleaning-manifest`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      manifest: { propertyId: string; checklist: { items: string[] } };
    }>();
    expect(body.manifest).toBeDefined();
    expect(body.manifest.propertyId).toBe(propertyId);
    expect(body.manifest.checklist.items.length).toBeGreaterThan(0);
    // Should contain placeholders, not real codes
    expect(JSON.stringify(body.manifest)).toContain('{{');
  });

  it('GET /cleaning-manifest returns 400 for invalid params', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/companies//properties/foo/cleaning-manifest',
    });
    // Fastify returns 400 or 404 depending on route matching
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  // ── Emergency Request ──

  it('POST /emergency-request creates incident and outbox rows', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/companies/${companyId}/cleaning/emergency-request`,
      payload: {
        propertyId,
        neededBy: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
        reason: 'API test emergency',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ ok: boolean; incidentId: string; outboxId: string }>();
    expect(body.ok).toBe(true);
    expect(body.incidentId).toBeDefined();
    expect(body.outboxId).toBeDefined();
  });

  it('POST /emergency-request returns 400 for missing reason', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/companies/${companyId}/cleaning/emergency-request`,
      payload: {
        propertyId,
        neededBy: new Date().toISOString(),
        // reason missing
      },
    });

    expect(res.statusCode).toBe(400);
  });

  // ── Telemetry Page ──

  it('GET /telemetry returns HTML page', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/telemetry',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Maid Triage');
    expect(res.body).toContain('p50 latency');
    expect(res.body).toContain('Recent Events');
  });
});
