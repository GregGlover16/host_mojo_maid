import type { FastifyInstance } from 'fastify';

/**
 * GET /health — liveness/readiness probe.
 * No authentication or tenant context required.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    return reply.send({ ok: true, timestamp: new Date().toISOString() });
  });
}
