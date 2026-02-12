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
    <div className="flex items-center gap-3 px-4 py-2.5 bg-hm-bg-deep border-b border-hm-border">
      {/* Scope selector */}
      <div className="flex items-center gap-1 bg-hm-surface rounded-[var(--radius-hm-sm)] p-0.5">
        {(["global", "company", "property"] as const).map((scope) => (
          <button
            key={scope}
            onClick={() => onChange({ ...filters, scope })}
            className={`px-2.5 py-1 text-xs rounded-[var(--radius-hm-sm)] transition-colors capitalize cursor-pointer ${
              filters.scope === scope
                ? "bg-hm-accent text-hm-bg-deep font-semibold"
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
          className="bg-hm-surface border border-hm-border rounded-[var(--radius-hm-sm)] px-2.5 py-1.5 text-xs text-hm-text cursor-pointer"
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
          className="bg-hm-surface border border-hm-border rounded-[var(--radius-hm-sm)] px-2.5 py-1.5 text-xs text-hm-text cursor-pointer"
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
      <div className="flex items-center gap-1.5 ml-auto">
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
          className="bg-hm-surface border border-hm-border rounded-[var(--radius-hm-sm)] px-2 py-1.5 text-xs text-hm-text"
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
          className="bg-hm-surface border border-hm-border rounded-[var(--radius-hm-sm)] px-2 py-1.5 text-xs text-hm-text"
        />
      </div>
    </div>
  );
}
