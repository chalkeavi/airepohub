import Link from "next/link";
import { cn } from "@/lib/utils";

/** Original mark: three ascending bars ("level up") in a rounded tile. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <rect width="32" height="32" rx="8" className="fill-accent" />
      <rect x="8" y="17" width="4" height="7" rx="1.5" className="fill-accent-foreground" opacity="0.6" />
      <rect x="14" y="12" width="4" height="12" rx="1.5" className="fill-accent-foreground" opacity="0.8" />
      <rect x="20" y="7" width="4" height="17" rx="1.5" className="fill-accent-foreground" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5 rounded-md", className)} aria-label="AIRepoHub home">
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-[-0.03em]">
        AIRepo<span className="text-accent">Hub</span>
      </span>
    </Link>
  );
}
