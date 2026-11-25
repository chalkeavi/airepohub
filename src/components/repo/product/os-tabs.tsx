"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** OS switcher. Every panel stays in the HTML (hidden attr) so crawlers see all instructions. */
export function OsTabs({ panels }: { panels: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(panels[0]?.id);
  const base = useId();
  return (
    <div>
      <div role="tablist" aria-label="Operating system" className="mb-4 inline-flex rounded-lg bg-surface-muted p-1">
        {panels.map((p) => (
          <button
            key={p.id}
            id={`${base}-tab-${p.id}`}
            role="tab"
            type="button"
            aria-selected={active === p.id}
            aria-controls={`${base}-panel-${p.id}`}
            onClick={() => setActive(p.id)}
            className={cn(
              "rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              active === p.id ? "bg-surface text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {panels.map((p) => (
        <div
          key={p.id}
          id={`${base}-panel-${p.id}`}
          role="tabpanel"
          aria-labelledby={`${base}-tab-${p.id}`}
          hidden={active !== p.id}
        >
          {p.content}
        </div>
      ))}
    </div>
  );
}
