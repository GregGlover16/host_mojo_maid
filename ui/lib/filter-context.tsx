"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { FilterState } from "./types";

// Default: 7-day window centered on today
function defaultFilters(): FilterState {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 3);
  const to = new Date(now);
  to.setDate(to.getDate() + 4);

  return {
    scope: "company",
    companyId: null,
    propertyId: null,
    dateFrom: from.toISOString(),
    dateTo: to.toISOString(),
  };
}

interface FilterContextValue {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFiltersRaw] = useState<FilterState>(defaultFilters);

  const setFilters = useCallback((f: FilterState) => {
    setFiltersRaw(f);
  }, []);

  return (
    <FilterContext.Provider value={{ filters, setFilters }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be used within FilterProvider");
  return ctx;
}
