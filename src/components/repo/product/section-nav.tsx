"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Sticky in-page navigation (wireframe "tabs"), highlights the section in view. */
export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  const [current, setCurrent] = useState(items[0]?.id);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, [items]);

  return (
    <nav
      aria-label="On this page"
      className="sticky top-16 z-30 -mx-4 border-b border-border bg-background/85 px-4 backdrop-blur-xl sm:mx-0 sm:px-0"
    >
      <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              aria-current={current === i.id ? "location" : undefined}
              className={cn(
                "relative block whitespace-nowrap px-3 py-3.5 text-sm font-medium transition-colors",
                current === i.id ? "text-accent" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {i.label}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent transition-opacity",
                  current === i.id ? "opacity-100" : "opacity-0",
                )}
              />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
