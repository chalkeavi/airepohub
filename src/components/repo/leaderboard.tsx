"use client";

import { ArrowUpRight, ChevronDown, LineChart, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import type { RankingPeriod } from "@/lib/types";
import { cn, formatCount } from "@/lib/utils";
import { RepoAvatar } from "./repo-avatar";

export interface LeaderboardRow {
  rank: number;
  slug: string;
  name: string;
  owner: string;
  avatarUrl: string | null;
  summary: string;
  stars: number;
  categoryName: string | null;
  language: string | null;
  updated: string;
  starGrowth: number | null;
  movement: number | null;
}

export interface LeaderboardData {
  period: RankingPeriod;
  rows: LeaderboardRow[];
  emptyReason: string | null;
}

const PERIODS: { id: RankingPeriod; label: string }[] = [
  { id: "weekly", label: "This week" },
  { id: "monthly", label: "This month" },
  { id: "all_time", label: "All time" },
];

export function Leaderboard({
  boards,
  categories,
  currentCategory,
  defaultPeriod = "all_time",
}: {
  boards: LeaderboardData[];
  categories: { slug: string; name: string }[];
  currentCategory?: string;
  defaultPeriod?: RankingPeriod;
}) {
  const [period, setPeriod] = useState<RankingPeriod>(defaultPeriod);
  const router = useRouter();
  const board = boards.find((b) => b.period === period);
  const hasGrowth = board?.rows.some((r) => r.starGrowth !== null) ?? false;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Ranking period" className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              role="tab"
              type="button"
              aria-selected={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={cn(
                "flex-1 rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors sm:flex-none",
                period === p.id
                  ? "border-ink bg-ink text-ink-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="relative flex items-center">
          <span className="sr-only">Filter by category</span>
          <select
            value={currentCategory ?? ""}
            onChange={(e) => router.push(e.target.value ? `/categories/${e.target.value}#rankings` : "/#rankings")}
            className="h-9 w-full appearance-none rounded-lg border border-border bg-surface pl-3 pr-9 text-[13px] font-medium text-foreground outline-none hover:border-border-strong focus:border-accent/60 sm:w-52"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 size-4 text-muted-foreground" aria-hidden />
        </label>
      </div>

      {!board || board.rows.length === 0 ? (
        <div className="p-4 sm:p-6">
          <EmptyState icon={LineChart} title="Not enough history yet">
            {board?.emptyReason ?? "No data yet."}
          </EmptyState>
        </div>
      ) : (
        <ol role="tabpanel" className="divide-y divide-border">
          <li className="hidden grid-cols-[3rem_minmax(0,1fr)_9rem_6rem_7rem] gap-4 px-5 py-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground md:grid" aria-hidden>
            <span>Rank</span>
            <span>Repository</span>
            <span>Category</span>
            <span className="text-right">Stars</span>
            <span className="text-right">{hasGrowth ? "Growth" : "Last push"}</span>
          </li>
          {board.rows.map((r) => (
            <li key={r.slug}>
              <Link
                href={`/repo/${r.slug}`}
                className="group grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-muted/70 md:grid-cols-[3rem_minmax(0,1fr)_9rem_6rem_7rem] md:gap-4 md:px-5"
              >
                <span
                  className={cn(
                    "font-display text-2xl font-medium italic tabular-nums md:text-[28px]",
                    r.rank <= 3 ? "text-accent" : "text-muted-foreground/70",
                  )}
                >
                  {String(r.rank).padStart(2, "0")}
                </span>
                <span className="flex min-w-0 items-center gap-3">
                  <RepoAvatar src={r.avatarUrl} name={r.name} size={36} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 text-[15px] font-semibold tracking-[-0.01em] group-hover:text-accent">
                      <span className="truncate">{r.name}</span>
                      <ArrowUpRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                    </span>
                    <span className="block truncate text-[13px] text-muted-foreground">{r.summary}</span>
                  </span>
                </span>
                <span className="hidden truncate text-[13px] text-muted-foreground md:block">{r.categoryName}</span>
                <span className="flex items-center justify-end gap-1 text-sm font-medium tabular-nums">
                  <Star className="size-3.5 text-warning" aria-hidden />
                  {formatCount(r.stars)}
                </span>
                <span className="hidden text-right text-[13px] tabular-nums text-muted-foreground md:block">
                  {r.starGrowth !== null ? `${r.starGrowth < 0 ? "−" : "+"}${formatCount(Math.abs(r.starGrowth))}` : r.updated}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
