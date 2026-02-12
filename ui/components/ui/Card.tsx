import { type ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  actions?: ReactNode;
}

export function Card({ children, className = "", title, actions }: CardProps) {
  return (
    <div
      className={`bg-hm-surface border border-hm-border rounded-[var(--radius-hm)] overflow-hidden ${className}`}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-hm-border">
          {title && (
            <h3 className="text-sm font-semibold text-hm-text">{title}</h3>
          )}
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
