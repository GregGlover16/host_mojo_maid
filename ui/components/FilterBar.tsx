"use client";

import { useEffect, useState } from "react";
import type { Company, Property, FilterState } from "@/lib/types";
import { getCompanies, getProperties } from "@/lib/api";

interface FilterBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);

  useEffect(() => {
    getCompanies()
      .then(setCompanies)
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    if (filters.companyId) {
      getProperties(filters.companyId)
        .then(setProperties)
        .catch(() => setProperties([]));
    } else {
      setProperties([]);
    }
  }, [filters.companyId]);

  // Auto-select first company on load
  useEffect(() => {
    if (companies.length > 0 && !filters.companyId) {
      onChange({ ...filters, companyId: companies[0].id });
    }
  }, [companies, filters, onChange]);

  return (
    <div className="border-b border-hm-border bg-hm-bg-elevated">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-6 px-4 py-4">
        <span className="text-sm font-medium text-hm-text-muted">Filters:</span>

        {/* Scope selector */}
        <div className="flex items-center gap-1 bg-hm-bg-card rounded-md p-0.5">
          {(["global", "company", "property"] as const).map((scope) => (
            <button
              key={scope}
              onClick={() => onChange({ ...filters, scope })}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors capitalize cursor-pointer ${
                filters.scope === scope
                  ? "bg-hm-accent text-white font-semibold"
                  : "text-hm-text-muted hover:text-hm-text"
              }`}
            >
              {scope}
            </button>
          ))}
        </div>

        {/* Company dropdown */}
        {filters.scope !== "global" && (
          <select
            value={filters.companyId || ""}
            onChange={(e) =>
              onChange({
                ...filters,
                companyId: e.target.value || null,
                propertyId: null,
              })
            }
            className="rounded-md border border-hm-border bg-hm-bg-card px-3 py-1.5 text-sm text-hm-text cursor-pointer"
          >
            <option value="">All Companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        {/* Property dropdown */}
        {filters.scope === "property" && (
          <select
            value={filters.propertyId || ""}
            onChange={(e) =>
              onChange({ ...filters, propertyId: e.target.value || null })
            }
            className="rounded-md border border-hm-border bg-hm-bg-card px-3 py-1.5 text-sm text-hm-text cursor-pointer"
          >
            <option value="">All Properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        {/* Date range */}
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-hm-text-dim">From</label>
          <input
            type="date"
            value={filters.dateFrom.split("T")[0]}
            onChange={(e) =>
              onChange({
                ...filters,
                dateFrom: e.target.value + "T00:00:00.000Z",
              })
            }
            className="rounded-md border border-hm-border bg-hm-bg-card px-3 py-1.5 text-sm text-hm-text"
          />
          <label className="text-xs text-hm-text-dim">To</label>
          <input
            type="date"
            value={filters.dateTo.split("T")[0]}
            onChange={(e) =>
              onChange({
                ...filters,
                dateTo: e.target.value + "T23:59:59.999Z",
              })
            }
            className="rounded-md border border-hm-border bg-hm-bg-card px-3 py-1.5 text-sm text-hm-text"
          />
        </div>

        {/* Reset */}
        <button
          className="rounded-md bg-hm-bg-card px-3 py-1.5 text-sm text-hm-text-muted hover:text-hm-text"
          onClick={() =>
            onChange({
              ...filters,
              scope: "company",
              propertyId: null,
              dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              dateTo: new Date().toISOString(),
            })
          }
        >
          Reset
        </button>
      </div>
    </div>
  );
}
