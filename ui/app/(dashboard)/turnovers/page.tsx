"use client";

import { useEffect, useState, useCallback } from "react";
import { useFilters } from "@/lib/filter-context";
import { listTasks } from "@/lib/api";
import type { CleaningTask, DisplayState } from "@/lib/types";
import { getDisplayState } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { StatusBadge, PaymentBadge } from "@/components/ui/StatusBadge";
import { PageLoading } from "@/components/ui/LoadingSpinner";

export default function TurnoversPage() {
  const { filters } = useFilters();
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CleaningTask | null>(null);

  const load = useCallback(async () => {
    if (!filters.companyId) return;
    try {
      const data = await listTasks({
        companyId: filters.companyId,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        propertyId: filters.propertyId || undefined,
      });
      setTasks(data);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    setLoading(true);
    load();
    // Poll every 30s
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  // Group tasks by property
  const grouped = tasks.reduce<Record<string, CleaningTask[]>>((acc, task) => {
    const key = task.property?.name || task.propertyId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(task);
    return acc;
  }, {});

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-hm-text">Turnovers</h1>
        <span className="text-xs text-hm-text-dim">
          {tasks.length} task{tasks.length !== 1 ? "s" : ""} in range
        </span>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <EmptyState />
      ) : (
        Object.entries(grouped).map(([propertyName, propertyTasks]) => (
          <Card key={propertyName} title={propertyName}>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Scheduled</th>
                    <th>Cleaner</th>
                    <th>Vendor</th>
                    <th>Payment</th>
                    <th>Booking</th>
                  </tr>
                </thead>
                <tbody>
                  {propertyTasks.map((task) => {
                    const state: DisplayState = getDisplayState(task);
                    return (
                      <tr
                        key={task.id}
                        className="cursor-pointer"
                        onClick={() => setSelected(task)}
                      >
                        <td>
                          <StatusBadge state={state} />
                        </td>
                        <td className="text-xs text-hm-text-muted whitespace-nowrap">
                          {fmtTime(task.scheduledStartAt)} &ndash;{" "}
                          {fmtTime(task.scheduledEndAt)}
                        </td>
                        <td className="text-sm">
                          {task.assignedCleaner ? (
                            <span>
                              {redactName(task.assignedCleaner.name)}
                              <span className="text-hm-text-dim ml-1.5 text-xs">
                                ({task.assignedCleaner.reliabilityScore}%)
                              </span>
                            </span>
                          ) : (
                            <span className="text-hm-text-dim">
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td className="text-xs text-hm-text-muted capitalize">
                          {task.vendor === "none" ? "-" : task.vendor}
                        </td>
                        <td>
                          <PaymentBadge status={task.paymentStatus} />
                        </td>
                        <td className="text-xs text-hm-text-dim font-mono">
                          {task.bookingId
                            ? task.bookingId.slice(0, 8)
                            : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      )}

      {/* Detail drawer */}
      {selected && (
        <TaskDetailDrawer
          task={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ── Helpers ──

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Redact full name to first name + last initial for PII safety */
function redactName(name: string): string {
  const parts = name.split(" ");
  if (parts.length < 2) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

// ── Task Detail Drawer ──

function TaskDetailDrawer({
  task,
  onClose,
}: {
  task: CleaningTask;
  onClose: () => void;
}) {
  const state = getDisplayState(task);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-hm-bg-deep border-l border-hm-border overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-hm-border">
          <h2 className="text-sm font-bold text-hm-text">Task Detail</h2>
          <button
            onClick={onClose}
            className="text-hm-text-dim hover:text-hm-text cursor-pointer"
          >
            &times;
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Status */}
          <div className="flex items-center gap-2">
            <StatusBadge state={state} />
            <PaymentBadge status={task.paymentStatus} />
          </div>

          {/* Property */}
          <Section label="Property">
            <p className="text-sm">{task.property.name}</p>
            <p className="text-xs text-hm-text-dim">
              {task.property.addressCity}, {task.property.addressState}
            </p>
            <p className="text-xs text-hm-text-dim">
              {task.property.bedrooms} BR / {task.property.bathrooms} BA &mdash;{" "}
              {task.property.cleaningDurationMinutes} min
            </p>
          </Section>

          {/* Schedule */}
          <Section label="Schedule">
            <p className="text-sm">
              {fmtDateTime(task.scheduledStartAt)} &ndash;{" "}
              {fmtDateTime(task.scheduledEndAt)}
            </p>
            {task.completedAt && (
              <p className="text-xs text-hm-success">
                Completed: {fmtDateTime(task.completedAt)}
              </p>
            )}
          </Section>

          {/* Cleaner */}
          <Section label="Assigned Cleaner">
            {task.assignedCleaner ? (
              <>
                <p className="text-sm">
                  {redactName(task.assignedCleaner.name)}
                </p>
                <p className="text-xs text-hm-text-dim">
                  Reliability: {task.assignedCleaner.reliabilityScore}%
                </p>
                {task.confirmedAt && (
                  <p className="text-xs text-hm-success">
                    Confirmed: {fmtDateTime(task.confirmedAt)}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-hm-text-dim">No cleaner assigned</p>
            )}
          </Section>

          {/* Vendor */}
          {task.vendor !== "none" && (
            <Section label="Vendor">
              <p className="text-sm capitalize">{task.vendor}</p>
              {task.vendorTaskId && (
                <p className="text-xs text-hm-text-dim font-mono">
                  {task.vendorTaskId}
                </p>
              )}
            </Section>
          )}

          {/* Payment */}
          <Section label="Payment">
            <p className="text-sm">
              ${(task.paymentAmountCents / 100).toFixed(2)}
            </p>
          </Section>

          {/* IDs */}
          <Section label="References">
            <p className="text-xs text-hm-text-dim font-mono">
              Task: {task.id.slice(0, 12)}...
            </p>
            {task.bookingId && (
              <p className="text-xs text-hm-text-dim font-mono">
                Booking: {task.bookingId.slice(0, 12)}...
              </p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-xs text-hm-text-muted uppercase tracking-wider mb-1">
        {label}
      </h4>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-hm-text-dim">
      <p className="text-sm">No turnovers found for the selected filters.</p>
      <p className="text-xs mt-1">
        Try adjusting the date range or scope.
      </p>
    </div>
  );
}
