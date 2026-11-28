import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed border-border-strong bg-surface/60 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="mb-4 grid size-11 place-items-center rounded-lg bg-accent-soft text-accent-soft-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <h3 className="font-display text-lg font-medium">{title}</h3>
      <div className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">{children}</div>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
