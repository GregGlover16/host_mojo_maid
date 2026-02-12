import type { DisplayState } from "@/lib/types";

const stateConfig: Record<
  DisplayState,
  { label: string; bg: string; text: string; dot: string }
> = {
  scheduled: {
    label: "Scheduled",
    bg: "bg-hm-text-dim/20",
    text: "text-hm-text-muted",
    dot: "bg-hm-text-dim",
  },
  assigned: {
    label: "Assigned",
    bg: "bg-hm-info-dim/40",
    text: "text-hm-info",
    dot: "bg-hm-info",
  },
  in_progress: {
    label: "In Progress",
    bg: "bg-hm-warning-dim/40",
    text: "text-hm-warning",
    dot: "bg-hm-warning",
  },
  completed: {
    label: "Completed",
    bg: "bg-hm-success-dim/40",
    text: "text-hm-success",
    dot: "bg-hm-success",
  },
  canceled: {
    label: "Canceled",
    bg: "bg-hm-text-dim/10",
    text: "text-hm-text-dim",
    dot: "bg-hm-text-dim",
  },
  at_risk: {
    label: "At Risk",
    bg: "bg-hm-danger-dim/40",
    text: "text-hm-danger",
    dot: "bg-hm-danger",
  },
};

interface StatusBadgeProps {
  state: DisplayState;
  className?: string;
}

export function StatusBadge({ state, className = "" }: StatusBadgeProps) {
  const cfg = stateConfig[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// Payment status badge
const paymentConfig: Record<string, { label: string; cls: string }> = {
  none: { label: "No Payment", cls: "text-hm-text-dim bg-hm-text-dim/10" },
  requested: {
    label: "Requested",
    cls: "text-hm-warning bg-hm-warning-dim/40",
  },
  paid: { label: "Paid", cls: "text-hm-success bg-hm-success-dim/40" },
  failed: { label: "Failed", cls: "text-hm-danger bg-hm-danger-dim/40" },
};

export function PaymentBadge({ status }: { status: string }) {
  const cfg = paymentConfig[status] || paymentConfig.none;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}
