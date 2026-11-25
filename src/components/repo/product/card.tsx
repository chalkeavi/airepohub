import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-7", className)} {...props} />;
}

export function SectionTitle({ id, children, kicker }: { id?: string; children: React.ReactNode; kicker?: string }) {
  return (
    <div className="mb-5">
      {kicker && <p className="eyebrow mb-1.5">{kicker}</p>}
      <h2 id={id} className="text-[22px] font-semibold tracking-[-0.025em] sm:text-2xl">
        {children}
      </h2>
    </div>
  );
}
