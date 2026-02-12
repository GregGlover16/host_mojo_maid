import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { v4 as uuid } from 'uuid';
import { EventsDal } from '../../dal/events.dal';
import { prisma } from '../../db/client';

const eventsDal = new EventsDal(prisma);

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    companyId?: string;
  }
}

/**
 * Fastify plugin: attaches a unique request_id to every request,
 * extracts company_id from route params, and logs structured
 * api.request.start / api.request.end telemetry events with
 * request_id, company_id, route, status_code, and duration_ms.
 */
async function requestContextPlugin(app: FastifyInstance): Promise<void> {
  // Assign requestId and extract companyId before handler runs
  app.addHook('onRequest', async (request: FastifyRequest) => {
    request.requestId = (request.headers['x-request-id'] as string) || uuid();
    // Extract companyId from route params if present
    const params = request.params as Record<string, string> | undefined;
    if (params?.companyId) {
      request.companyId = params.companyId;
    }
  });

  // Log api.request.start at the start of each request
  app.addHook('preHandler', async (request: FastifyRequest) => {
    request.log.info(
      {
        requestId: request.requestId,
        companyId: request.companyId,
        route: request.routeOptions?.url ?? request.url,
        method: request.method,
      },
      'api.request.start',
    );

    // Write telemetry event (fire-and-forget, never block the request)
    eventsDal
      .create({
        companyId: request.companyId ?? null,
        type: 'api.request.start',
        payload: JSON.stringify({
          requestId: request.requestId,
          route: request.routeOptions?.url ?? request.url,
          method: request.method,
        }),
        requestId: request.requestId,
      })
      .catch(() => {
        // telemetry write failure is non-fatal
      });
  });

  // Log api.request.end with duration and status code after response is sent
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const durationMs = Math.round(reply.elapsedTime);

    request.log.info(
      {
        requestId: request.requestId,
        companyId: request.companyId,
        route: request.routeOptions?.url ?? request.url,
        method: request.method,
        statusCode: reply.statusCode,
        durationMs,
      },
      'api.request.end',
    );

    // Write telemetry event with duration
    eventsDal
      .create({
        companyId: request.companyId ?? null,
        type: 'api.request.end',
        payload: JSON.stringify({
          requestId: request.requestId,
          route: request.routeOptions?.url ?? request.url,
          method: request.method,
          statusCode: reply.statusCode,
        }),
        requestId: request.requestId,
        durationMs,
      })
      .catch(() => {
        // telemetry write failure is non-fatal
      });
  });
}

export default fp(requestContextPlugin, {
  name: 'request-context',
});
