import { Star } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { Category, Repository } from "@/lib/types";
import { DIFFICULTY_LABEL, cn, formatCount } from "@/lib/utils";
import { RepoAvatar } from "./repo-avatar";

export function RepoCard({
  repo,
  category,
  showDifficulty,
  meta,
  className,
}: {
  repo: Repository;
  category?: Category;
  showDifficulty?: boolean;
  meta?: string;
  className?: string;
}) {
  return (
    <Link
      href={`/repo/${repo.slug}`}
      className={cn(
        "group flex h-full flex-col rounded-xl border border-border bg-surface p-5 shadow-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-accent hover:shadow-raised",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <RepoAvatar src={repo.avatarUrl} name={repo.name} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold tracking-[-0.01em] group-hover:text-accent">{repo.name}</h3>
          <p className="truncate text-xs text-muted-foreground">{repo.owner}</p>
        </div>
        <span className="flex items-center gap-1 text-xs font-medium tabular-nums text-muted-foreground">
          <Star className="size-3.5" aria-hidden />
          {formatCount(repo.stars)}
        </span>
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{repo.summary ?? repo.description}</p>
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
        {category && <Badge tone="accent">{category.name}</Badge>}
        {repo.primaryLanguage && <Badge tone="muted">{repo.primaryLanguage}</Badge>}
        {showDifficulty && repo.difficulty && <Badge tone="success">{DIFFICULTY_LABEL[repo.difficulty]} setup</Badge>}
        {meta && <span className="ml-auto text-xs text-muted-foreground">{meta}</span>}
      </div>
    </Link>
  );
}
