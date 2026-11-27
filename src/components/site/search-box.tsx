"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

export interface Suggestion {
  slug: string;
  name: string;
  owner: string;
  summary: string;
}

/**
 * Global search with instant suggestions. Suggestions are a small server-provided list
 * (names only); full search runs server-side at /search.
 */
export function SearchBox({
  suggestions,
  size = "md",
  placeholder = "Search AI repositories…",
  shortcut = false,
  className,
}: {
  suggestions: Suggestion[];
  size?: "md" | "lg";
  placeholder?: string;
  shortcut?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();

  // Server results for the current query (whole catalog); the embedded list only has top repos.
  const [remote, setRemote] = useState<{ q: string; items: Suggestion[] }>({ q: "", items: [] });

  const local = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return suggestions
      .filter((s) => s.name.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, suggestions]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const extra = remote.q === q ? remote.items : [];
    const seen = new Set(local.map((m) => m.slug));
    return [...local, ...extra.filter((m) => !seen.has(m.slug))].slice(0, 6);
  }, [local, remote, query]);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || local.length >= 6) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<Suggestion[]>) : []))
        .then((items) => setRemote({ q, items }))
        .catch(() => {}); // offline or aborted: local suggestions still work
    }, 180);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, local.length]);

  useEffect(() => {
    if (!shortcut) return;
    function onKey(e: KeyboardEvent) {
      const typing = (e.target as HTMLElement)?.closest("input, textarea, [contenteditable]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut]);

  function submit() {
    setOpen(false);
    if (active >= 0 && matches[active]) {
      router.push(`/repo/${matches[active].slug}`);
    } else if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  }

  const showList = open && matches.length > 0;

  return (
    <form
      role="search"
      action="/search"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cn("relative", className)}
    >
      <label className="sr-only" htmlFor={`${listId}-input`}>
        Search repositories
      </label>
      <Search
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
          size === "lg" ? "left-4 size-5" : "left-3 size-4",
        )}
      />
      <input
        ref={inputRef}
        id={`${listId}-input`}
        name="q"
        type="search"
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, -1));
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={cn(
          "w-full rounded-xl border border-border bg-surface text-foreground shadow-card outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-accent/60 focus:ring-4 focus:ring-accent/15 [&::-webkit-search-cancel-button]:hidden",
          size === "lg" ? "h-14 pl-12 pr-28 text-base" : "h-10 pl-9 pr-14 text-sm",
        )}
      />
      {size === "lg" ? (
        <button
          type="submit"
          className="absolute right-2 top-1/2 h-10 -translate-y-1/2 rounded-lg bg-ink px-4 text-sm font-medium text-ink-foreground transition-opacity hover:opacity-90"
        >
          Search
        </button>
      ) : (
        shortcut && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 gap-1 sm:flex">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        )
      )}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-surface p-1.5 text-left shadow-raised"
        >
          {matches.map((m, i) => (
            <li
              key={m.slug}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                router.push(`/repo/${m.slug}`);
                setOpen(false);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer flex-col rounded-lg px-3 py-2",
                i === active ? "bg-surface-muted" : "",
              )}
            >
              <span className="text-sm font-medium">
                {m.name} <span className="font-normal text-muted-foreground">· {m.owner}</span>
              </span>
              <span className="truncate text-xs text-muted-foreground">{m.summary}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
