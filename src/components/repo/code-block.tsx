import { tokenize } from "@/lib/highlight";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

/** Server-rendered, lightly highlighted shell block with a copy button. */
export function CodeBlock({
  code,
  lang = "bash",
  className,
}: {
  code: string;
  lang?: "bash" | "powershell" | "text";
  className?: string;
}) {
  const lines = tokenize(code);
  const copyValue = code
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return (
    <div className={cn("group relative overflow-hidden rounded-lg border border-terminal-border bg-terminal", className)}>
      <div className="flex items-center justify-between border-b border-terminal-border px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-terminal-muted">
          {lang === "powershell" ? "PowerShell" : lang === "bash" ? "Shell" : "Text"}
        </span>
        <CopyButton value={copyValue} label="Copy commands" className="text-terminal-muted hover:bg-white/10 hover:text-terminal-foreground" />
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-6 text-terminal-foreground">
        <code>
          {lines.map((tokens, i) => (
            <span key={i} className="block min-h-6">
              {tokens.map((t, j) => (
                <span key={j} className={t.kind === "text" ? undefined : `tok-${t.kind}`}>
                  {t.value}
                </span>
              ))}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
