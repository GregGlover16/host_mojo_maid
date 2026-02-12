import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../config/logger';

// Single PrismaClient instance reused across the app.
// In test, each test file creates its own client against an isolated DB.
export const prisma = new PrismaClient({
  log:
    env.NODE_ENV === 'development'
      ? [
          { level: 'query', emit: 'event' },
          { level: 'error', emit: 'stdout' },
        ]
      : [{ level: 'error', emit: 'stdout' }],
});

// Log slow queries in dev
if (env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    if (e.duration > 100) {
      logger.warn({ duration: e.duration, query: e.query }, 'Slow query detected');
    }
  });
}
