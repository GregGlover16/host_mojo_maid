"use client";

import { useEffect, useState, useCallback } from "react";
import { useFilters } from "@/lib/filter-context";
import { getRollup, getIncidents } from "@/lib/api";
import type { Rollup, Incident } from "@/lib/types";
import { MetricCard } from "@/components/ui/MetricCard";
import { Card } from "@/components/ui/Card";
import { PageLoading } from "@/components/ui/LoadingSpinner";

/**
 * ROI formulas (documented in TRACEABILITY.md):
 *
 * Time Saved = tasksCompleted * 15 min (estimated manual coordination time per turnover)
 * Verification Success Rate = onTimeRate (from rollup)
 * No-show Incidents = count of NO_SHOW incidents in the date range
 * Cost Savings = timeSavedMinutes * (hourlyOpsCost / 60)
 *   where hourlyOpsCost = $35 (median US property management assistant rate)
 */
const MINUTES_SAVED_PER_TURNOVER = 15;
const HOURLY_OPS_COST = 35;

export default function RoiPage() {
  const { filters } = useFilters();
  const [rollup, setRollup] = useState<Rollup | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!filters.companyId) return;
    try {
      const [r, inc] = await Promise.all([
        getRollup({
          companyId: filters.companyId,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          scope: filters.scope,
          propertyId: filters.propertyId || undefined,
        }),
        getIncidents(filters.companyId),
      ]);
      setRollup(r);
      setIncidents(inc);
    } catch {
      setRollup(null);
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    setLoading(true);
    load();
    const timer = setInterval(load, 5 * 60_000); // 5 min
    return () => clearInterval(timer);
  }, [load]);

  if (loading) return <PageLoading />;
  if (!rollup) {
    return (
      <div className="flex items-center justify-center h-48 text-hm-text-dim text-sm">
        No data available for the selected filters.
      </div>
    );
  }

  const timeSavedMin = rollup.tasksCompleted * MINUTES_SAVED_PER_TURNOVER;
  const timeSavedHours = (timeSavedMin / 60).toFixed(1);
  const costSavings = ((timeSavedMin / 60) * HOURLY_OPS_COST).toFixed(0);
  const verificationRate = (rollup.onTimeRate * 100).toFixed(0);
  const completionRate = rollup.tasksTotal
    ? ((rollup.tasksCompleted / rollup.tasksTotal) * 100).toFixed(0)
    : "N/A";
  const coverageRate = rollup.tasksTotal
    ? (((rollup.tasksTotal - rollup.noShowCount) / rollup.tasksTotal) * 100).toFixed(0)
    : "N/A";

  // No-show incidents from the incidents array
  const noShowCount = incidents.filter((i) => i.type === "NO_SHOW").length;

  // Incident breakdown
  const incidentCounts: Record<string, number> = {};
  for (const inc of incidents) {
    incidentCounts[inc.type] = (incidentCounts[inc.type] || 0) + 1;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-hm-text">Automation & ROI</h1>

      {/* Hero metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Time Saved"
          value={`${timeSavedHours}h`}
          subtext={`${timeSavedMin} minutes (${MINUTES_SAVED_PER_TURNOVER} min/turnover)`}
          icon="⏱"
          accent="success"
          large
        />
        <MetricCard
          label="Est. Cost Savings"
          value={`$${costSavings}`}
          subtext={`@ $${HOURLY_OPS_COST}/hr ops cost`}
          icon="💰"
          accent="success"
          large
        />
        <MetricCard
          label="Coverage Rate"
          value={`${coverageRate}%`}
          subtext="Tasks without no-shows"
          icon="🛡"
          accent={Number(coverageRate) >= 95 ? "success" : Number(coverageRate) >= 85 ? "warning" : "danger"}
          large
        />
        <MetricCard
          label="On-Time Rate"
          value={`${verificationRate}%`}
          subtext="Completed before scheduled end"
          icon="✅"
          accent={
            rollup.onTimeRate >= 0.85
              ? "success"
              : rollup.onTimeRate >= 0.7
                ? "warning"
                : "danger"
          }
          large
        />
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Turnovers Completed"
          value={rollup.tasksCompleted}
          subtext={`${rollup.tasksTotal} total in range`}
          icon="📋"
        />
        <MetricCard
          label="Completion Rate"
          value={`${completionRate}%`}
          subtext={`${rollup.tasksCompleted} / ${rollup.tasksTotal}`}
          icon="📊"
        />
        <MetricCard
          label="Avg Clean Duration"
          value={
            rollup.avgCleanDurationMinutes
              ? `${rollup.avgCleanDurationMinutes}m`
              : "N/A"
          }
          subtext="Scheduled to completed"
          icon="🕐"
        />
        <MetricCard
          label="No-Show Incidents"
          value={noShowCount}
          subtext="In incident log"
          icon="⚠️"
          accent={noShowCount === 0 ? "success" : "danger"}
        />
      </div>

      {/* Payment + Cost */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MetricCard
          label="Payment Total"
          value={`$${(rollup.paymentTotalCents / 100).toFixed(0)}`}
          subtext="Paid cleaning fees"
          icon="💵"
        />
        <MetricCard
          label="Avg Cost per Turnover"
          value={
            rollup.tasksCompleted
              ? `$${((rollup.paymentTotalCents / 100) / rollup.tasksCompleted).toFixed(0)}`
              : "N/A"
          }
          subtext="Payment / completed tasks"
          icon="🧮"
        />
        <MetricCard
          label="Tasks Failed"
          value={rollup.noShowCount}
          subtext="Required re-dispatch"
          icon="❌"
          accent={rollup.noShowCount === 0 ? "success" : "danger"}
        />
      </div>

      {/* Incident breakdown */}
      <Card title="Incident Breakdown" subtitle="All time">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Count</th>
                <th>Severity</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(incidentCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <tr key={type}>
                    <td className="text-sm font-medium">{type}</td>
                    <td className="text-sm">{count}</td>
                    <td>
                      <SeverityIndicator type={type} incidents={incidents} />
                    </td>
                  </tr>
                ))}
              {Object.keys(incidentCounts).length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="text-center text-hm-text-dim py-4"
                  >
                    No incidents recorded
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Formula documentation */}
      <Card title="ROI Formula Documentation">
        <div className="p-4 space-y-2 text-xs text-hm-text-muted">
          <p>
            <strong className="text-hm-text">Time Saved</strong> = Completed Turnovers &times;{" "}
            {MINUTES_SAVED_PER_TURNOVER} min/turnover (estimated manual
            coordination time)
          </p>
          <p>
            <strong className="text-hm-text">Cost Savings</strong> = (Time Saved in hours) &times; $
            {HOURLY_OPS_COST}/hr (median US property management assistant rate)
          </p>
          <p>
            <strong className="text-hm-text">Coverage Rate</strong> = (Total Tasks - No-Shows) / Total
            Tasks — measures operational reliability
          </p>
          <p>
            <strong className="text-hm-text">On-Time Rate</strong> = % of completed tasks finished before
            scheduledEndAt
          </p>
          <p>
            <strong className="text-hm-text">Completion Rate</strong> = tasksCompleted / tasksTotal in
            date range
          </p>
        </div>
      </Card>
    </div>
  );
}

function SeverityIndicator({ type, incidents }: { type: string; incidents: Incident[] }) {
  const typeIncidents = incidents.filter((i) => i.type === type);
  const highCount = typeIncidents.filter((i) => i.severity === "high").length;
  const medCount = typeIncidents.filter((i) => i.severity === "med").length;
  const lowCount = typeIncidents.filter((i) => i.severity === "low").length;

  return (
    <div className="flex items-center gap-1.5">
      {highCount > 0 && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-900/30 text-red-400">
          {highCount} high
        </span>
      )}
      {medCount > 0 && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-900/30 text-orange-400">
          {medCount} med
        </span>
      )}
      {lowCount > 0 && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-900/30 text-gray-400">
          {lowCount} low
        </span>
      )}
    </div>
  );
}
