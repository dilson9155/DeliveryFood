import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/format";

type Variant = "default" | "outline" | "ghost" | "secondary" | "danger" | "success";
type Size = "default" | "sm" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  default: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  outline: "border border-border bg-transparent hover:bg-muted text-foreground",
  ghost: "hover:bg-muted text-foreground",
  secondary: "bg-muted text-foreground hover:bg-border",
  danger: "bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20",
  success: "bg-success/10 text-success border border-success/20 hover:bg-success/20",
};

const sizes: Record<Size, string> = {
  default: "h-10 px-4 text-sm",
  sm: "h-8 px-3 text-xs",
  lg: "h-12 px-6 text-base",
  icon: "h-10 w-10",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}