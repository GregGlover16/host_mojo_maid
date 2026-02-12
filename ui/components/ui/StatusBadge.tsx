import type { DisplayState } from "@/lib/types";

const stateConfig: Record<
  DisplayState,
  { label: string; bg: string; text: string; dot: string }
> = {
  scheduled: {
    label: "Scheduled",
    bg: "bg-gray-900/30",
    text: "text-gray-400",
    dot: "bg-gray-400",
  },
  assigned: {
    label: "Assigned",
    bg: "bg-blue-900/30",
    text: "text-blue-400",
    dot: "bg-blue-400",
  },
  confirmed: {
    label: "Confirmed",
    bg: "bg-indigo-900/30",
    text: "text-indigo-400",
    dot: "bg-indigo-400",
  },
  in_progress: {
    label: "In Progress",
    bg: "bg-purple-900/30",
    text: "text-purple-400",
    dot: "bg-purple-400",
  },
  completed: {
    label: "Completed",
    bg: "bg-green-900/30",
    text: "text-green-400",
    dot: "bg-green-400",
  },
  verified: {
    label: "Verified",
    bg: "bg-green-900/30",
    text: "text-green-300",
    dot: "bg-green-300",
  },
  canceled: {
    label: "Canceled",
    bg: "bg-gray-900/30",
    text: "text-gray-500",
    dot: "bg-gray-500",
  },
  failed: {
    label: "Failed",
    bg: "bg-red-900/30",
    text: "text-red-400",
    dot: "bg-red-400",
  },
  at_risk: {
    label: "At Risk",
    bg: "bg-orange-900/30",
    text: "text-orange-400",
    dot: "bg-orange-400",
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
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-medium capitalize ${cfg.bg} ${cfg.text} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// Payment status badge
const paymentConfig: Record<string, { label: string; cls: string }> = {
  none: { label: "No Payment", cls: "text-gray-400 bg-gray-900/30" },
  requested: {
    label: "Requested",
    cls: "text-yellow-400 bg-yellow-900/30",
  },
  paid: { label: "Paid", cls: "text-green-400 bg-green-900/30" },
  failed: { label: "Failed", cls: "text-red-400 bg-red-900/30" },
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

// Vendor badge
const vendorConfig: Record<string, { label: string; cls: string }> = {
  none: { label: "In-House", cls: "text-gray-400 bg-gray-900/30 border-gray-700" },
  turno: { label: "Turno", cls: "text-purple-400 bg-purple-900/30 border-purple-700" },
  breezeway: { label: "Breezeway", cls: "text-teal-400 bg-teal-900/30 border-teal-700" },
  handy: { label: "Handy", cls: "text-orange-400 bg-orange-900/30 border-orange-700" },
};

export function VendorBadge({ vendor }: { vendor: string }) {
  const cfg = vendorConfig[vendor] || vendorConfig.none;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}
