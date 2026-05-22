import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const baseField = cn(
  "h-10 w-full rounded-md border border-[--color-border]",
  "bg-[--color-surface-2] px-3 text-sm text-[--color-text]",
  "placeholder:text-[--color-faint]",
  "transition-colors duration-150",
  "focus:outline-none focus:border-[--color-accent]/60 focus:bg-[--color-surface-3]",
  "disabled:opacity-50 disabled:cursor-not-allowed"
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(baseField, className)} {...props} />
  )
);
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        baseField,
        "appearance-none pr-9 cursor-pointer",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 fill=%22none%22 stroke=%22%23a1a1aa%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%223 4.5 6 7.5 9 4.5%22/></svg>')] bg-no-repeat bg-[right_12px_center]",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = "Select";

export const ScoreInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="number"
      className={cn(
        "h-12 w-14 rounded-lg border border-[--color-border]",
        "bg-[--color-surface-2] text-center text-xl font-semibold font-mono text-[--color-text]",
        "transition-all duration-150",
        "focus:outline-none focus:border-[--color-accent] focus:bg-[--color-surface-3] focus:ring-2 focus:ring-[--color-accent]/20",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  )
);
ScoreInput.displayName = "ScoreInput";
