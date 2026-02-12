interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: "up" | "down" | "flat";
  accent?: "default" | "success" | "warning" | "danger";
}

const accentColors = {
  default: "text-hm-accent",
  success: "text-hm-success",
  warning: "text-hm-warning",
  danger: "text-hm-danger",
};

export function MetricCard({
  label,
  value,
  subtext,
  accent = "default",
}: MetricCardProps) {
  return (
    <div className="bg-hm-surface border border-hm-border rounded-[var(--radius-hm)] p-4 min-w-[160px]">
      <div className="text-xs text-hm-text-muted uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={`text-2xl font-bold ${accentColors[accent]}`}>
        {value}
      </div>
      {subtext && (
        <div className="text-xs text-hm-text-dim mt-1">{subtext}</div>
      )}
    </div>
  );
}
