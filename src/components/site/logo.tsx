import Link from "next/link";
import { cn } from "@/lib/utils";

/** Original mark: three ascending bars ("level up") in a rounded tile. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <rect width="32" height="32" rx="5" className="fill-ink" />
      <rect x="8" y="17" width="4" height="7" rx="1.5" className="fill-ink-foreground" opacity="0.55" />
      <rect x="14" y="12" width="4" height="12" rx="1.5" className="fill-ink-foreground" opacity="0.8" />
      <rect x="20" y="7" width="4" height="17" rx="1.5" className="fill-highlight" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5 rounded-md", className)} aria-label="AIRepoHub home">
      <LogoMark />
      <span className="font-display text-[20px] font-semibold tracking-[-0.02em]">
        AIRepo<span className="italic text-accent">Hub</span>
      </span>
    </Link>
  );
}
