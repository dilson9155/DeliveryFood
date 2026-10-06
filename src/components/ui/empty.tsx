import type { HTMLAttributes } from "react";
import { cn } from "@/lib/format";

export function Loading({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center justify-center py-10", className)} {...props}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand-600" />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/40 px-6 py-12 text-center",
        className
      )}
    >
      {icon && <div className="text-3xl text-muted-foreground">{icon}</div>}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}