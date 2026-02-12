import { type ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
}

const variantStyles = {
  primary:
    "bg-hm-accent text-white hover:bg-hm-accent-dark font-semibold",
  secondary:
    "bg-hm-bg-card border border-hm-border text-hm-text hover:bg-hm-bg-hover",
  danger:
    "bg-red-900/30 text-hm-danger hover:bg-red-900/50 border border-red-700/30",
  ghost: "text-hm-text-muted hover:text-hm-text hover:bg-hm-bg-hover",
};

const sizeStyles = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3.5 py-1.5 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
