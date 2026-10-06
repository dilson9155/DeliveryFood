import type { HTMLAttributes } from "react";
import { cn } from "@/lib/format";

type Tone = "default" | "muted" | "success" | "warning" | "danger" | "info" | "brand";

const tones: Record<Tone, string> = {
  default: "bg-muted text-muted-foreground border-border",
  muted: "bg-border text-muted-foreground border-transparent",
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  danger: "bg-danger/10 text-danger border-danger/20",
  info: "bg-info/10 text-info border-info/20",
  brand: "bg-brand-100 text-brand-800 border-brand-200",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
};

export function Badge({ className, tone = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}