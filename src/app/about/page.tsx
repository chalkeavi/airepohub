import type { Metadata } from "next";
import { ProsePage } from "@/components/site/prose-page";
import { ACTIVITY_RULES } from "@/lib/activity";
import { WEIGHTS } from "@/lib/ranking";

export const metadata: Metadata = {
  title: "About AIRepoHub and how rankings work",
  description: "What AIRepoHub is, how we write repository guides, and how the Top 10 ranking is calculated.",
  alternates: { canonical: "/about" },
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function AboutPage() {
  return (
    <ProsePage
      title="About AIRepoHub"
      intro="GitHub has thousands of useful AI projects. We turn the best of them into plain-English guides you can act on."
    >
      <p>
        For each repository we explain what it does, who it&apos;s for, what it costs to run, and how to install and use
        it. Guides are written from the project&apos;s own documentation, link back to their sources, and are reviewed
        by a person before they&apos;re published.
      </p>
      <h2>Our honesty rules</h2>
      <ul>
        <li>We never invent features, commands, outputs or numbers.</li>
        <li>
          Every install guide shows whether it was <strong>verified by testing</strong>, is{" "}
          <strong>based on official documentation</strong>, or is <strong>awaiting verification</strong>.
        </li>
        <li>If we don&apos;t have data yet, we say so instead of guessing.</li>
      </ul>
      <h2 id="rankings" className="scroll-mt-24">How rankings work</h2>
      <p>Each repository gets a score from five signals, each scaled from 0 to 1 across all candidates:</p>
      <ul>
        <li><strong>Total stars ({pct(WEIGHTS.stars)})</strong>, log-scaled so the biggest projects don&apos;t drown out everyone else.</li>
        <li><strong>Recent star growth ({pct(WEIGHTS.growth)})</strong>, measured from our own daily snapshots.</li>
        <li><strong>Activity ({pct(WEIGHTS.activity)})</strong>, full marks for a push in the last week, fading to zero after a year.</li>
        <li><strong>Documentation quality ({pct(WEIGHTS.docs)})</strong>, from our editorial review.</li>
        <li><strong>Community ({pct(WEIGHTS.community)})</strong>, based on forks (log-scaled).</li>
      </ul>
      <p>
        When a signal isn&apos;t available for every repository, we leave it out and rescale the others, and the
        leaderboard says which signals were used. Weekly and monthly rankings appear only once we have enough history
        to measure real growth.
      </p>
      <h2>Activity status</h2>
      <p>
        <strong>Active</strong> means code was pushed in the last {ACTIVITY_RULES.activeDays} days,{" "}
        <strong>Slowing down</strong> means {ACTIVITY_RULES.activeDays} to {ACTIVITY_RULES.slowingDays} days, and{" "}
        <strong>Inactive</strong> means more than a year.
      </p>
    </ProsePage>
  );
}
