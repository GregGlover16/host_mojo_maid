import fastify, { type FastifyInstance } from 'fastify';
import { env } from './config/env';
import requestContextPlugin from './api/middleware/request-context';
import { healthRoutes } from './api/health';
import { versionRoutes } from './api/version';
import { cleaningTaskRoutes } from './api/cleaning-tasks';
import { phase4Routes } from './api/phase4';
import { telemetryRoutes } from './api/telemetry';
import { uiDataRoutes } from './api/ui-data';

/**
 * Creates and configures the Fastify application.
 * Exported as a factory so tests can create isolated instances.
 */
export function buildApp(): FastifyInstance {
  const app = fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // Middleware: request_id + structured logging on all routes
  void app.register(requestContextPlugin);

  // Register routes
  void app.register(healthRoutes);
  void app.register(versionRoutes);
  void app.register(cleaningTaskRoutes);
  void app.register(phase4Routes);
  void app.register(telemetryRoutes);
  void app.register(uiDataRoutes);

  return app;
}
