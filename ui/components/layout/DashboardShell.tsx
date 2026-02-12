"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const TABS = [
  { href: "/turnovers", label: "Turnovers" },
  { href: "/dispatch", label: "Dispatch" },
  { href: "/vendors", label: "Vendors" },
  { href: "/roi", label: "ROI" },
  { href: "/telemetry", label: "Telemetry" },
] as const;

interface DashboardShellProps {
  children: ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-hm-bg">
      {/* Header */}
      <header className="border-b border-hm-border bg-hm-bg-card">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="flex items-center gap-4">
              <Image
                src="/images/host_mojo_logo.png"
                alt="Host Mojo"
                width={120}
                height={60}
                className="h-10 w-auto object-contain opacity-90"
                priority
              />
              <div className="border-l border-hm-border pl-4">
                <h1 className="text-xl font-bold text-hm-text">
                  Maid Triage
                </h1>
                <p className="text-xs text-hm-text-muted">
                  Command Center
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="border-b border-hm-border bg-hm-bg-card">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex gap-6">
            {TABS.map((tab) => {
              const isActive = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`px-2 py-3 text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? "border-b-2 border-hm-accent text-hm-accent"
                      : "text-hm-text-muted hover:text-hm-text"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Content */}
      {children}
    </div>
  );
}
