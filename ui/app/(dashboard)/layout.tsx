"use client";

import { Sidebar } from "@/components/Sidebar";
import { FilterBar } from "@/components/FilterBar";
import { FilterProvider, useFilters } from "@/lib/filter-context";
import type { ReactNode } from "react";

function DashboardInner({ children }: { children: ReactNode }) {
  const { filters, setFilters } = useFilters();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-[var(--sidebar-width)]">
        <FilterBar filters={filters} onChange={setFilters} />
        <main className="p-5">{children}</main>
      </div>
    </div>
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
