import { logger } from '../config/logger';

/**
 * Simple timing helper for measuring operation durations.
 * Usage:
 *   const timer = startTimer('db.query');
 *   await doSomething();
 *   timer.stop(); // logs duration
 */
export function startTimer(label: string): { stop: () => number } {
  const start = performance.now();

  return {
    stop(): number {
      const durationMs = Math.round(performance.now() - start);
      logger.debug({ label, durationMs }, 'Timer completed');
      return durationMs;
    },
  };
}
