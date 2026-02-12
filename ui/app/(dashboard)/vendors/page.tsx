"use client";

import { useEffect, useState, useCallback } from "react";
import { useFilters } from "@/lib/filter-context";
import { getCleaners } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { PageLoading } from "@/components/ui/LoadingSpinner";

interface CleanerWithProperties {
  id: string;
  companyId: string;
  name: string;
  phone: string;
  email: string;
  status: string;
  reliabilityScore: number;
  propertyLinks: {
    priority: number;
    property: { id: string; name: string };
  }[];
}

export default function VendorsPage() {
  const { filters } = useFilters();
  const [cleaners, setCleaners] = useState<CleanerWithProperties[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!filters.companyId) return;
    try {
      const data = await getCleaners(filters.companyId);
      setCleaners(data as unknown as CleanerWithProperties[]);
    } catch {
      setCleaners([]);
    } finally {
      setLoading(false);
    }
  }, [filters.companyId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  if (loading) return <PageLoading />;

  const active = cleaners.filter((c) => c.status === "active");
  const inactive = cleaners.filter((c) => c.status === "inactive");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-hm-text">Vendor Roster</h1>
        <span className="text-xs text-hm-text-dim">
          {active.length} active / {inactive.length} inactive
        </span>
      </div>

      <Card title={`Active Cleaners (${active.length})`}>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Reliability</th>
                <th>Coverage Area</th>
                <th>Primary Properties</th>
                <th>Backup Properties</th>
              </tr>
            </thead>
            <tbody>
              {active.map((cleaner) => (
                <CleanerRow key={cleaner.id} cleaner={cleaner} />
              ))}
              {active.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-hm-text-dim py-4">
                    No active cleaners
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {inactive.length > 0 && (
        <Card title={`Inactive Cleaners (${inactive.length})`}>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Reliability</th>
                  <th>Coverage Area</th>
                  <th>Primary Properties</th>
                  <th>Backup Properties</th>
                </tr>
              </thead>
              <tbody>
                {inactive.map((cleaner) => (
                  <CleanerRow key={cleaner.id} cleaner={cleaner} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function CleanerRow({ cleaner }: { cleaner: CleanerWithProperties }) {
  const primaryProps = cleaner.propertyLinks
    .filter((l) => l.priority === 1)
    .map((l) => l.property.name);
  const backupProps = cleaner.propertyLinks
    .filter((l) => l.priority === 2)
    .map((l) => l.property.name);

  return (
    <tr>
      <td>
        <div className="text-sm font-medium">{redactName(cleaner.name)}</div>
      </td>
      <td>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
            cleaner.status === "active"
              ? "bg-hm-success-dim/40 text-hm-success"
              : "bg-hm-text-dim/20 text-hm-text-dim"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              cleaner.status === "active" ? "bg-hm-success" : "bg-hm-text-dim"
            }`}
          />
          {cleaner.status}
        </span>
      </td>
      <td>
        <ReliabilityBar score={cleaner.reliabilityScore} />
      </td>
      <td className="text-xs text-hm-text-muted">
        {cleaner.propertyLinks.length} propert
        {cleaner.propertyLinks.length !== 1 ? "ies" : "y"}
      </td>
      <td className="text-xs text-hm-text-muted">
        {primaryProps.length > 0 ? primaryProps.join(", ") : "-"}
      </td>
      <td className="text-xs text-hm-text-muted">
        {backupProps.length > 0 ? backupProps.join(", ") : "-"}
      </td>
    </tr>
  );
}

function ReliabilityBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-hm-success"
      : score >= 60
        ? "bg-hm-warning"
        : "bg-hm-danger";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-hm-bg-deep rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs text-hm-text-muted">{score}%</span>
    </div>
  );
}

function redactName(name: string): string {
  const parts = name.split(" ");
  if (parts.length < 2) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}
