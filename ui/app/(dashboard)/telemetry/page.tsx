"use client";

import { useEffect, useState, useCallback } from "react";
import { getEvents, getOutboxSummary } from "@/lib/api";
import type { TelemetryEvent } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { PageLoading } from "@/components/ui/LoadingSpinner";

export default function TelemetryPage() {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [outboxCounts, setOutboxCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [ev, ob] = await Promise.all([
        getEvents(50),
        getOutboxSummary(),
      ]);
      setEvents(ev);
      setOutboxCounts(ob);
    } catch {
      setEvents([]);
      setOutboxCounts({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-hm-text">Telemetry</h1>

      {/* Outbox status counts */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard
          label="Outbox Pending"
          value={outboxCounts.pending || 0}
          accent={
            (outboxCounts.pending || 0) > 10 ? "warning" : "default"
          }
        />
        <MetricCard
          label="Outbox Sent"
          value={outboxCounts.sent || 0}
          accent="success"
        />
        <MetricCard
          label="Outbox Failed"
          value={outboxCounts.failed || 0}
          accent={
            (outboxCounts.failed || 0) > 0 ? "danger" : "success"
          }
        />
      </div>

      {/* Recent events */}
      <Card title={`Recent Events (last ${events.length})`}>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Company</th>
                <th>Request ID</th>
                <th>Duration</th>
                <th>Entity</th>
                <th>Payload</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td className="text-xs text-hm-text-muted whitespace-nowrap">
                    {fmtTime(ev.createdAt)}
                  </td>
                  <td className="text-xs font-mono">
                    <EventTypeBadge type={ev.type} />
                  </td>
                  <td className="text-xs text-hm-text-dim font-mono">
                    {ev.companyId
                      ? ev.companyId.slice(0, 8) + "..."
                      : "-"}
                  </td>
                  <td className="text-xs text-hm-text-dim font-mono">
                    {ev.requestId
                      ? ev.requestId.slice(0, 8) + "..."
                      : "-"}
                  </td>
                  <td className="text-xs text-hm-text-muted">
                    {ev.durationMs != null ? `${ev.durationMs}ms` : "-"}
                  </td>
                  <td className="text-xs text-hm-text-dim">
                    {ev.entityType && ev.entityId
                      ? `${ev.entityType}:${ev.entityId.slice(0, 8)}`
                      : "-"}
                  </td>
                  <td className="text-xs text-hm-text-dim max-w-[200px] truncate font-mono">
                    {truncate(ev.payload, 60)}
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center text-hm-text-dim py-4"
                  >
                    No events recorded
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

function EventTypeBadge({ type }: { type: string }) {
  let cls = "text-hm-text-muted";
  if (type.includes("error") || type.includes("fail")) {
    cls = "text-hm-danger";
  } else if (type.includes("service.span")) {
    cls = "text-hm-accent";
  } else if (type.includes("completed") || type.includes("success")) {
    cls = "text-hm-success";
  } else if (type.includes("incident") || type.includes("no_show")) {
    cls = "text-hm-warning";
  }
  return <span className={cls}>{type}</span>;
}
