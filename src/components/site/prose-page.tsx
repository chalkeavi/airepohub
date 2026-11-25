import type { ReactNode } from "react";

export function ProsePage({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <article className="container-page max-w-3xl pt-14">
      <h1 className="text-4xl font-semibold tracking-[-0.035em]">{title}</h1>
      {intro && <p className="mt-3 text-lg text-muted-foreground">{intro}</p>}
      <div className="mt-8 space-y-5 text-[15px] leading-relaxed text-muted-foreground [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-[-0.02em] [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground">
        {children}
      </div>
    </article>
  );
}

export function DraftNotice({ what }: { what: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border-strong bg-surface p-5">
      Our {what} is being written and will be published here before AIRepoHub launches publicly.
    </p>
  );
}
