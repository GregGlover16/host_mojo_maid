interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: string;
  trend?: "up" | "down" | "flat";
  accent?: "default" | "success" | "warning" | "danger";
  large?: boolean;
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
  icon,
  accent = "default",
  large,
}: MetricCardProps) {
  return (
    <div className="rounded-lg border border-hm-border bg-hm-bg-card p-4 min-w-[160px]">
      <div className="flex items-center justify-between">
        <div className="text-xs text-hm-text-muted uppercase tracking-wider mb-1">
          {label}
        </div>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <div className={`${large ? "text-3xl" : "text-2xl"} font-bold ${accentColors[accent]}`}>
        {value}
      </div>
      {subtext && (
        <div className="text-xs text-hm-text-dim mt-1">{subtext}</div>
      )}
    </div>
  );
}
