import { cn } from "@/lib/utils";

/** GitHub owner avatar. Plain <img> (images are unoptimized on Workers, decision #13). */
export function RepoAvatar({
  src,
  name,
  size = 40,
  className,
}: {
  src: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const radius = size >= 64 ? "rounded-2xl" : "rounded-[10px]";
  if (!src) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size }}
        className={cn("grid shrink-0 place-items-center bg-accent-soft font-semibold text-accent-soft-foreground", radius, className)}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  const px = Math.min(460, Math.ceil(size * 2));
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${src}${src.includes("?") ? "&" : "?"}s=${px}`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={cn("shrink-0 border border-border bg-surface-muted object-cover", radius, className)}
    />
  );
}
