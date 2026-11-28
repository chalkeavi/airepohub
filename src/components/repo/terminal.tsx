import { tokenizeLine } from "@/lib/highlight";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

/** Decorative-but-real terminal: shows documented commands only, never invented output. */
export function Terminal({
  title = "Terminal",
  commands,
  footnote,
  className,
}: {
  title?: string;
  commands: { comment?: string; command: string }[];
  footnote?: string;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-xl border border-terminal-border bg-terminal text-terminal-foreground shadow-terminal",
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-terminal-border py-2 pl-5 pr-3">
        <figcaption className="flex min-w-0 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-terminal-muted">
          <span aria-hidden className="size-1.5 shrink-0 bg-highlight" />
          <span className="truncate">{title}</span>
        </figcaption>
        <CopyButton
          value={commands.map((c) => c.command).join("\n")}
          label="Copy commands"
          className="relative ml-auto text-terminal-muted hover:bg-white/10 hover:text-terminal-foreground"
        />
      </div>
      <pre className="overflow-x-auto px-5 py-4 font-mono text-[13px] leading-[1.75]">
        <code>
          {commands.map((c, i) => (
            <span key={i} className="block">
              {c.comment && <span className="tok-comment block"># {c.comment}</span>}
              <span className="select-none text-terminal-muted">$ </span>
              {tokenizeLine(c.command).map((t, j) => (
                <span key={j} className={t.kind === "text" ? undefined : `tok-${t.kind}`}>
                  {t.value}
                </span>
              ))}
              {i < commands.length - 1 && <span className="block h-2" />}
            </span>
          ))}
        </code>
      </pre>
      {footnote && <p className="border-t border-terminal-border px-5 py-2 text-[11px] text-terminal-muted">{footnote}</p>}
    </figure>
  );
}
