import { forwardRef, type ButtonHTMLAttributes, type AnchorHTMLAttributes } from "react";
import Link, { type LinkProps } from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

export const buttonBase = cn(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium tracking-tight",
  "transition-all duration-150 cursor-pointer select-none whitespace-nowrap",
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-accent]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[--color-bg]"
);

const variants: Record<Variant, string> = {
  primary:
    "bg-[--color-accent] text-[--color-accent-fg] hover:brightness-110 active:brightness-95 shadow-[0_0_0_1px_rgba(198,242,78,0.4),0_10px_30px_-12px_rgba(198,242,78,0.6)]",
  secondary:
    "bg-[--color-surface-2] text-[--color-text] hover:bg-[--color-surface-3] border border-[--color-border]",
  outline:
    "bg-transparent text-[--color-text] border border-[--color-border] hover:border-[--color-border-strong] hover:bg-[--color-surface]",
  ghost:
    "bg-transparent text-[--color-muted] hover:text-[--color-text] hover:bg-[--color-surface]",
  danger:
    "bg-transparent text-[--color-danger] border border-[--color-danger]/30 hover:bg-[--color-danger-soft]"
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-[15px]",
  icon: "h-9 w-9"
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonBase, variants[variant], sizes[size], className)}
      {...props}
    />
  )
);
Button.displayName = "Button";

type LinkButtonProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    variant?: Variant;
    size?: Size;
    className?: string;
    children?: React.ReactNode;
  };

export function LinkButton({
  className,
  variant = "primary",
  size = "md",
  ...props
}: LinkButtonProps) {
  return (
    <Link
      className={cn(buttonBase, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}
