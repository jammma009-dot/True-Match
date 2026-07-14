import React from "react";

export function Spinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
    </div>
  );
}

export function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 text-center">
      {children}
    </div>
  );
}

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
}

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const base =
    "w-full touch-manipulation rounded-2xl py-3.5 text-base font-semibold transition-all disabled:opacity-40 active:scale-[0.98]";
  const styles =
    variant === "primary"
      ? "bg-gradient-to-r from-brand to-brand-dark text-white shadow-lg shadow-brand/25"
      : "bg-[var(--tg-secondary-bg-color)] text-tg";
  return (
    <button type="button" className={`${base} ${styles} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/** Thin progress bar that fills left-to-right. `value` is 0..1. */
export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--tg-secondary-bg-color)]">
      <div
        className="h-full rounded-full bg-brand transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  );
}

export function Card({
  children,
  className = "",
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl bg-[var(--tg-secondary-bg-color)] ${className}`}
    >
      {children}
    </div>
  );
}
