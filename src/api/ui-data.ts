import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client';
import { companyIdSchema } from '../types/common';
import { z } from 'zod';

/**
 * UI-specific read-only data endpoints.
 * These complement the existing cleaning-tasks routes by exposing
 * companies, properties, cleaners, incidents, outbox rows, and
 * telemetry events as JSON for the Command Center UI.
 *
 * All tenant-scoped routes validate companyId at the boundary.
 */
export async function uiDataRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /companies — list all companies ──
  app.get('/companies', async (_request, reply) => {
    const companies = await prisma.company.findMany({
      orderBy: { name: 'asc' },
    });
    return reply.send(companies);
  });

  // ── GET /companies/:companyId/properties — list properties for a company ──
  app.get<{ Params: { companyId: string } }>(
    '/companies/:companyId/properties',
    async (request, reply) => {
      const params = z.object({ companyId: companyIdSchema }).safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: 'invalid_params', message: params.error.message });
      }

      const properties = await prisma.property.findMany({
        where: { companyId: params.data.companyId },
        orderBy: { name: 'asc' },
      });
      return reply.send(properties);
    },
  );

  // ── GET /companies/:companyId/cleaners — list cleaners for a company ──
  app.get<{ Params: { companyId: string } }>(
    '/companies/:companyId/cleaners',
    async (request, reply) => {
      const params = z.object({ companyId: companyIdSchema }).safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: 'invalid_params', message: params.error.message });
      }

      const cleaners = await prisma.cleaner.findMany({
        where: { companyId: params.data.companyId },
        include: {
          propertyLinks: {
            include: { property: { select: { id: true, name: true } } },
          },
        },
        orderBy: { name: 'asc' },
      });
      return reply.send(cleaners);
    },
  );

  // ── GET /companies/:companyId/incidents — list incidents for a company ──
  app.get<{ Params: { companyId: string } }>(
    '/companies/:companyId/incidents',
    async (request, reply) => {
      const params = z.object({ companyId: companyIdSchema }).safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: 'invalid_params', message: params.error.message });
      }

      const incidents = await prisma.incident.findMany({
        where: { companyId: params.data.companyId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          task: {
            select: { id: true, status: true, propertyId: true, scheduledStartAt: true },
          },
        },
      });
      return reply.send(incidents);
    },
  );

  // ── GET /companies/:companyId/outbox — list recent outbox rows ──
  app.get<{ Params: { companyId: string } }>(
    '/companies/:companyId/outbox',
    async (request, reply) => {
      const params = z.object({ companyId: companyIdSchema }).safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: 'invalid_params', message: params.error.message });
      }

      const rows = await prisma.outbox.findMany({
        where: { companyId: params.data.companyId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          type: true,
          status: true,
          attempts: true,
          createdAt: true,
          nextAttemptAt: true,
        },
      });
      return reply.send(rows);
    },
  );

  // ── GET /telemetry/events — JSON list of recent telemetry events ──
  app.get<{ Querystring: { limit?: string } }>(
    '/telemetry/events',
    async (request, reply) => {
      const limit = Math.min(Number(request.query.limit) || 50, 200);

      const events = await prisma.event.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return reply.send(events);
    },
  );

  // ── GET /telemetry/outbox-summary — outbox status counts ──
  app.get('/telemetry/outbox-summary', async (_request, reply) => {
    const rows = await prisma.outbox.findMany({
      select: { status: true },
    });

    const counts: Record<string, number> = { pending: 0, sent: 0, failed: 0 };
    for (const row of rows) {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
    }

    return reply.send(counts);
  });
}
