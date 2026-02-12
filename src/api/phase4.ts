import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getCleaningManifest } from '../services/cleaning-manifest.service';
import { requestEmergencyCleaning } from '../services/emergency.service';
import { companyIdSchema, entityIdSchema, buildTenantContext } from '../types/common';

const companyParamSchema = z.object({
  companyId: companyIdSchema,
});

const manifestParamSchema = z.object({
  companyId: companyIdSchema,
  propertyId: entityIdSchema,
});

const emergencyBodySchema = z.object({
  propertyId: entityIdSchema,
  neededBy: z.string().datetime(),
  reason: z.string().min(1).max(500),
});

/**
 * Phase 4 routes:
 *  - GET /companies/:companyId/properties/:propertyId/cleaning-manifest
 *  - POST /companies/:companyId/cleaning/emergency-request
 *
 * Phase 6: Uses shared ID schemas and TenantContext.
 * request.requestId is set by the request-context middleware.
 */
export async function phase4Routes(app: FastifyInstance): Promise<void> {
  // ── Cleaning Manifest ──
  app.get<{
    Params: { companyId: string; propertyId: string };
  }>(
    '/companies/:companyId/properties/:propertyId/cleaning-manifest',
    async (request, reply) => {
      const params = manifestParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: 'invalid_params', message: params.error.message });
      }

      const tenant = buildTenantContext(params.data.companyId);

      const manifest = await getCleaningManifest(
        tenant.companyId,
        params.data.propertyId,
      );

      return reply.send({ manifest });
    },
  );

  // ── Emergency Cleaning Request ──
  app.post<{
    Params: { companyId: string };
    Body: { propertyId: string; neededBy: string; reason: string };
  }>(
    '/companies/:companyId/cleaning/emergency-request',
    async (request, reply) => {
      const params = companyParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: 'invalid_params', message: params.error.message });
      }

      const body = emergencyBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: 'invalid_body', message: body.error.message });
      }

      const tenant = buildTenantContext(params.data.companyId);

      const result = await requestEmergencyCleaning(
        {
          companyId: tenant.companyId,
          propertyId: body.data.propertyId,
          neededBy: body.data.neededBy,
          reason: body.data.reason,
        },
        request.requestId,
      );

      if (!result.success) {
        return reply.status(500).send({ error: 'emergency_request_failed', message: result.error });
      }

      return reply.status(201).send({
        ok: true,
        incidentId: result.incidentId,
        outboxId: result.outboxId,
      });
    },
  );
}
