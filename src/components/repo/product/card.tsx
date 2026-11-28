import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-border bg-surface p-5 sm:p-7", className)} {...props} />;
}

export function SectionTitle({ id, children, kicker }: { id?: string; children: React.ReactNode; kicker?: string }) {
  return (
    <div className="mb-5">
      {kicker && <p className="eyebrow mb-1.5">{kicker}</p>}
      <h2 id={id} className="font-display text-[24px] font-medium leading-[1.15] tracking-[-0.015em] sm:text-[28px]">
        {children}
      </h2>
    </div>
  );
}
