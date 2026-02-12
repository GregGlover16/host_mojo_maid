"use client";

import { useEffect, useState, useCallback } from "react";
import { useFilters } from "@/lib/filter-context";
import {
  listTasks,
  getIncidents,
  requestEmergencyCleaning,
} from "@/lib/api";
import type { CleaningTask, Incident } from "@/lib/types";
import { getDisplayState } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { StatusBadge, VendorBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { PageLoading } from "@/components/ui/LoadingSpinner";

interface ExceptionItem {
  type: "no_show" | "late" | "emergency" | "at_risk";
  label: string;
  task: CleaningTask;
  incident?: Incident;
  recommendation: string;
}

export default function DispatchPage() {
  const { filters } = useFilters();
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!filters.companyId) return;
    try {
      const [tasks, incidents] = await Promise.all([
        listTasks({
          companyId: filters.companyId,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          propertyId: filters.propertyId || undefined,
        }),
        getIncidents(filters.companyId),
      ]);

      const items: ExceptionItem[] = [];

      // Build incident lookup by taskId
      const incidentMap = new Map<string, Incident[]>();
      for (const inc of incidents) {
        const list = incidentMap.get(inc.taskId) || [];
        list.push(inc);
        incidentMap.set(inc.taskId, list);
      }

      for (const task of tasks) {
        const state = getDisplayState(task);
        const taskIncidents = incidentMap.get(task.id) || [];

        // No-show incidents
        const noShow = taskIncidents.find((i) => i.type === "NO_SHOW");
        if (noShow) {
          items.push({
            type: "no_show",
            label: "No-Show",
            task,
            incident: noShow,
            recommendation: "Re-dispatch backup cleaner or request emergency clean.",
          });
          continue;
        }

        // At-risk tasks (late / unconfirmed)
        if (state === "at_risk" && task.status === "assigned") {
          const start = new Date(task.scheduledStartAt);
          const now = new Date();
          if (start < now) {
            items.push({
              type: "late",
              label: "Cleaner Late",
              task,
              recommendation:
                "Cleaner has not checked in past scheduled start. Send reminder or escalate.",
            });
          } else {
            items.push({
              type: "at_risk",
              label: "Confirmation At Risk",
              task,
              recommendation:
                "Approaching start time without cleaner confirmation. Send reminder.",
            });
          }
          continue;
        }

        // Failed tasks
        if (task.status === "failed") {
          items.push({
            type: "emergency",
            label: "Failed Task",
            task,
            recommendation:
              "Task failed. Request emergency cleaning or manually re-dispatch.",
          });
        }
      }

      // Sort by severity: no_show first, then late, then emergency, then at_risk
      const priority = { no_show: 0, late: 1, emergency: 2, at_risk: 3 };
      items.sort((a, b) => priority[a.type] - priority[b.type]);

      setExceptions(items);
    } catch {
      setExceptions([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    setLoading(true);
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const handleEmergency = async (task: CleaningTask) => {
    if (!filters.companyId) return;
    try {
      await requestEmergencyCleaning(filters.companyId, {
        propertyId: task.propertyId,
        neededBy: task.scheduledEndAt,
        reason: `Emergency clean requested from dispatch console for ${task.property.name}`,
      });
      setActionMessage("Emergency cleaning request created (outbox).");
      load();
    } catch (err) {
      setActionMessage(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
    setTimeout(() => setActionMessage(null), 4000);
  };

  if (loading) return <PageLoading />;

  const typeCounts = exceptions.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-hm-text">
          Dispatch & Exceptions
        </h1>
        <span className="text-xs text-hm-text-muted">
          {exceptions.length} actionable item
          {exceptions.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Summary chips */}
      <div className="flex gap-2 flex-wrap">
        {typeCounts.no_show ? (
          <Chip color="danger" label={`${typeCounts.no_show} No-Show`} />
        ) : null}
        {typeCounts.late ? (
          <Chip color="warning" label={`${typeCounts.late} Late`} />
        ) : null}
        {typeCounts.emergency ? (
          <Chip
            color="danger"
            label={`${typeCounts.emergency} Failed`}
          />
        ) : null}
        {typeCounts.at_risk ? (
          <Chip
            color="warning"
            label={`${typeCounts.at_risk} At Risk`}
          />
        ) : null}
        {exceptions.length === 0 && (
          <Chip color="success" label="All Clear" />
        )}
      </div>

      {/* Action message toast */}
      {actionMessage && (
        <div className="bg-blue-900/30 border border-hm-accent/30 text-hm-accent text-xs px-3 py-2 rounded-md">
          {actionMessage}
        </div>
      )}

      {/* Escalation ladder reference */}
      <Card title="Escalation Ladder" subtitle="Automated response timeline">
        <div className="p-4">
          <div className="flex items-center gap-2">
            {[
              { time: "T+0", label: "Task Assigned", color: "bg-blue-400" },
              { time: "T+10m", label: "Reminder Sent", color: "bg-yellow-400" },
              { time: "T+20m", label: "Escalation", color: "bg-orange-400" },
              { time: "T+40m", label: "Re-dispatch", color: "bg-red-400" },
              { time: "T+60m", label: "Host Notified", color: "bg-red-600" },
            ].map((step, i, arr) => (
              <div key={step.time} className="flex items-center gap-2">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full ${step.color}`} />
                  <span className="text-[9px] text-hm-text-dim mt-0.5 whitespace-nowrap font-medium">
                    {step.time}
                  </span>
                  <span className="text-[9px] text-hm-text-muted whitespace-nowrap">
                    {step.label}
                  </span>
                </div>
                {i < arr.length - 1 && (
                  <div className="h-0.5 w-8 bg-hm-border-light mt-[-18px]" />
                )}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Exception queue */}
      {exceptions.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-hm-text-dim">
          <p className="text-sm">No exceptions found. All turnovers on track.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {exceptions.map((item, i) => (
            <Card key={`${item.task.id}-${i}`}>
              <div className="p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <ExceptionTypeBadge type={item.type} label={item.label} />
                    <StatusBadge state={getDisplayState(item.task)} />
                    {item.task.vendor !== "none" && (
                      <VendorBadge vendor={item.task.vendor} />
                    )}
                  </div>
                  <p className="text-sm font-medium text-hm-text truncate">
                    {item.task.property.name}
                  </p>
                  <p className="text-xs text-hm-text-muted mt-0.5">
                    {fmtDateTime(item.task.scheduledStartAt)} &ndash;{" "}
                    {fmtDateTime(item.task.scheduledEndAt)}
                  </p>
                  {item.task.assignedCleaner && (
                    <p className="text-xs text-hm-text-dim mt-0.5">
                      Cleaner: {redactName(item.task.assignedCleaner.name)}
                    </p>
                  )}
                  <p className="text-xs text-hm-text-muted mt-2 italic">
                    {item.recommendation}
                  </p>
                  {item.incident && (
                    <p className="text-xs text-hm-danger mt-1">
                      Incident: {item.incident.description.slice(0, 80)}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleEmergency(item.task)}
                  >
                    Emergency Clean
                  </Button>
                  <Button size="sm" variant="secondary">
                    Send Escalation
                  </Button>
                  <Button size="sm" variant="ghost">
                    Notify Host
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function redactName(name: string): string {
  const parts = name.split(" ");
  if (parts.length < 2) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

function Chip({ color, label }: { color: string; label: string }) {
  const colors: Record<string, string> = {
    danger: "bg-red-900/30 text-red-400",
    warning: "bg-orange-900/30 text-orange-400",
    success: "bg-green-900/30 text-green-400",
  };
  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[color] || colors.warning}`}
    >
      {label}
    </span>
  );
}

function ExceptionTypeBadge({
  type,
  label,
}: {
  type: string;
  label: string;
}) {
  const colors: Record<string, string> = {
    no_show: "bg-red-900/50 text-red-300 border border-red-700/50",
    late: "bg-orange-900/50 text-orange-300 border border-orange-700/50",
    emergency: "bg-red-900/50 text-red-300 border border-red-700/50",
    at_risk: "bg-orange-900/30 text-orange-400 border border-orange-700/30",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${colors[type] || ""}`}
    >
      {label}
    </span>
  );
}
