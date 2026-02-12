import { type ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function Card({ children, className = "", title, subtitle, actions }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-hm-border bg-hm-bg-card overflow-hidden ${className}`}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-hm-border">
          <div>
            {title && (
              <h3 className="text-sm font-semibold text-hm-text">{title}</h3>
            )}
            {subtitle && (
              <p className="text-xs text-hm-text-muted">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
