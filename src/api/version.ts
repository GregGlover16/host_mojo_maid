import type { FastifyInstance } from 'fastify';
import { env } from '../config/env';
import pkg from '../../package.json';

/**
 * GET /version — returns app version and environment.
 * No authentication or tenant context required.
 * Git SHA will be added in a later phase via build-time injection.
 */
export async function versionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/version', async (_request, reply) => {
    return reply.send({
      version: pkg.version,
      environment: env.NODE_ENV,
    });
  });
}
