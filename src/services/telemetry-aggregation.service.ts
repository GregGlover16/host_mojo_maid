import { prisma } from '../db/client';
import { EventsDal } from '../dal/events.dal';

const eventsDal = new EventsDal(prisma);

export interface LatencyStats {
  count: number;
  p50: number;
  p95: number;
  min: number;
  max: number;
}

export interface IncidentCounts {
  [type: string]: number;
}

export interface TelemetrySummary {
  latency: LatencyStats;
  incidentCounts: IncidentCounts;
  totalEvents: number;
}

/**
 * Compute p50 and p95 latency from all events that have a durationMs value.
 * Returns zeros if no timed events exist.
 */
export function computePercentiles(durations: number[]): LatencyStats {
  if (durations.length === 0) {
    return { count: 0, p50: 0, p95: 0, min: 0, max: 0 };
  }

  // Ensure sorted ascending
  const sorted = [...durations].sort((a, b) => a - b);

  return {
    count: sorted.length,
    p50: sorted[Math.floor(sorted.length * 0.5)]!,
    p95: sorted[Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1)]!,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  };
}

/**
 * Count incidents by type within a date range.
 */
export async function getIncidentCounts(
  since: Date,
  companyId?: string,
): Promise<IncidentCounts> {
  const where: Record<string, unknown> = {
    createdAt: { gte: since },
  };
  if (companyId) where.companyId = companyId;

  const incidents = await prisma.incident.findMany({
    where,
    select: { type: true },
  });

  const counts: IncidentCounts = {};
  for (const inc of incidents) {
    counts[inc.type] = (counts[inc.type] ?? 0) + 1;
  }
  return counts;
}

/**
 * Get a full telemetry summary: latency stats + incident counts + total events.
 */
export async function getTelemetrySummary(
  sinceDays = 30,
  companyId?: string,
): Promise<TelemetrySummary> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60_000);

  const timedEvents = await eventsDal.findWithDuration();
  const durations = timedEvents.map((e) => e.durationMs!);

  const latency = computePercentiles(durations);
  const incidentCounts = await getIncidentCounts(since, companyId);

  const totalEvents = await prisma.event.count();

  return { latency, incidentCounts, totalEvents };
}
