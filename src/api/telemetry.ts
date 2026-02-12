import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client';

/**
 * Lightweight telemetry/observability page.
 * Serves a single HTML page at GET /telemetry with:
 *  - Last 100 events
 *  - API latency p50/p95
 *  - Incident counts by type (last 30 days)
 */
export async function telemetryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/telemetry', async (_request, reply) => {
    // 1. Last 100 events
    const events = await prisma.event.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // 2. Latency stats from events with durationMs
    const timedEvents = await prisma.event.findMany({
      where: { durationMs: { not: null } },
      orderBy: { durationMs: 'asc' },
      select: { durationMs: true },
    });

    let p50 = 0;
    let p95 = 0;
    if (timedEvents.length > 0) {
      const durations = timedEvents.map((e) => e.durationMs!);
      p50 = durations[Math.floor(durations.length * 0.5)]!;
      p95 = durations[Math.floor(durations.length * 0.95)]!;
    }

    // 3. Incidents by type (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    const incidents = await prisma.incident.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { type: true },
    });

    const incidentCounts: Record<string, number> = {};
    for (const inc of incidents) {
      incidentCounts[inc.type] = (incidentCounts[inc.type] ?? 0) + 1;
    }

    // Build HTML
    const eventsRows = events
      .map(
        (e) =>
          `<tr>
            <td>${escapeHtml(e.createdAt.toISOString())}</td>
            <td>${escapeHtml(e.type)}</td>
            <td>${escapeHtml(e.companyId ?? '-')}</td>
            <td>${e.durationMs ?? '-'}</td>
            <td class="payload">${escapeHtml(truncate(e.payload, 120))}</td>
          </tr>`,
      )
      .join('\n');

    const incidentRows = Object.entries(incidentCounts)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([type, count]) =>
          `<tr><td>${escapeHtml(type)}</td><td>${count}</td></tr>`,
      )
      .join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Host Mojo Maid — Telemetry</title>
  <style>
    :root {
      /* Host Mojo theme stubs — replace with brand CSS later */
      --hm-bg: #0f172a;
      --hm-surface: #1e293b;
      --hm-text: #e2e8f0;
      --hm-accent: #38bdf8;
      --hm-border: #334155;
      --hm-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: var(--hm-bg);
      color: var(--hm-text);
      padding: 24px;
    }
    h1 { margin-bottom: 8px; color: var(--hm-accent); }
    h2 { margin: 24px 0 12px; color: var(--hm-accent); font-size: 1.1rem; }
    .stats {
      display: flex;
      gap: 24px;
      margin: 16px 0;
    }
    .stat-card {
      background: var(--hm-surface);
      border: 1px solid var(--hm-border);
      border-radius: 8px;
      padding: 16px 24px;
      min-width: 140px;
    }
    .stat-card .label { color: var(--hm-muted); font-size: 0.85rem; }
    .stat-card .value { font-size: 1.5rem; font-weight: 600; margin-top: 4px; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--hm-surface);
      border-radius: 8px;
      overflow: hidden;
    }
    th, td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid var(--hm-border);
      font-size: 0.85rem;
    }
    th { background: var(--hm-border); font-weight: 600; }
    .payload { max-width: 300px; word-break: break-all; color: var(--hm-muted); }
    .timestamp { font-size: 0.75rem; color: var(--hm-muted); }
  </style>
</head>
<body>
  <h1>Maid Triage — Telemetry Dashboard</h1>
  <p class="timestamp">Generated at ${new Date().toISOString()}</p>

  <h2>API Latency</h2>
  <div class="stats">
    <div class="stat-card">
      <div class="label">p50 latency</div>
      <div class="value">${p50} ms</div>
    </div>
    <div class="stat-card">
      <div class="label">p95 latency</div>
      <div class="value">${p95} ms</div>
    </div>
    <div class="stat-card">
      <div class="label">Timed events</div>
      <div class="value">${timedEvents.length}</div>
    </div>
  </div>

  <h2>Incidents (last 30 days)</h2>
  <table>
    <thead><tr><th>Type</th><th>Count</th></tr></thead>
    <tbody>${incidentRows || '<tr><td colspan="2">No incidents</td></tr>'}</tbody>
  </table>

  <h2>Recent Events (last 100)</h2>
  <table>
    <thead>
      <tr><th>Time</th><th>Type</th><th>Company</th><th>Duration (ms)</th><th>Payload</th></tr>
    </thead>
    <tbody>${eventsRows || '<tr><td colspan="5">No events</td></tr>'}</tbody>
  </table>
</body>
</html>`;

    return reply.type('text/html').send(html);
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}
