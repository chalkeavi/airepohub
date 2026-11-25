import type { CodeStep } from "@/lib/types";
import { CodeBlock } from "../code-block";

export function StepList({ steps }: { steps: CodeStep[] }) {
  return (
    <ol className="space-y-6">
      {steps.map((s, i) => (
        <li key={i} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-4">
          <span className="grid size-8 place-items-center rounded-full bg-accent-soft font-mono text-sm font-semibold text-accent-soft-foreground">
            {i + 1}
          </span>
          <div className="min-w-0 pt-1">
            <h4 className="text-[15px] font-semibold">{s.title}</h4>
            {s.body && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>}
            {s.code && <CodeBlock code={s.code} lang={s.lang} className="mt-3" />}
          </div>
        </li>
      ))}
    </ol>
  );
}
