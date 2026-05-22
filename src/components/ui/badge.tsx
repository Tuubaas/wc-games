import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "default" | "accent" | "muted" | "danger" | "blue" | "gold";

const tones: Record<Tone, string> = {
  default: "bg-[--color-surface-3] text-[--color-text] border-[--color-border]",
  accent: "bg-[--color-accent-soft] text-[--color-accent] border-[--color-accent]/30",
  muted: "bg-transparent text-[--color-muted] border-[--color-border]",
  danger: "bg-[--color-danger-soft] text-[--color-danger] border-[--color-danger]/30",
  blue: "bg-[#0c1a2b] text-[--color-blue] border-[--color-blue]/30",
  gold: "bg-[#241c08] text-[--color-gold] border-[--color-gold]/30"
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ className, tone = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
        "text-[11px] font-medium tracking-wide uppercase",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
