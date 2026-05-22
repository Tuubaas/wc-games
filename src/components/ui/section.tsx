import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageHeader({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[--color-border] pb-6">
      <div>
        {eyebrow ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[--color-accent]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-[--color-text]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-xl text-sm text-[--color-muted]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  className
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[--color-border] bg-[--color-surface]/70 p-5",
        className
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[--color-faint]">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-[--color-text] font-mono">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-[--color-muted]">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-[--color-border] bg-[--color-surface]/40 p-6 text-sm text-[--color-muted]">
      {children}
    </div>
  );
}
