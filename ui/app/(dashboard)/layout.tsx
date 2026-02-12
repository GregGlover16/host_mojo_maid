"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { FilterBar } from "@/components/FilterBar";
import { FilterProvider, useFilters } from "@/lib/filter-context";
import type { ReactNode } from "react";

function DashboardInner({ children }: { children: ReactNode }) {
  const { filters, setFilters } = useFilters();

  return (
    <DashboardShell>
      <FilterBar filters={filters} onChange={setFilters} />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </DashboardShell>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <FilterProvider>
      <DashboardInner>{children}</DashboardInner>
    </FilterProvider>
  );
}
