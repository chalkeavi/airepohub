import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 212021 → "212k", 1530 → "1.5k", 5 → "5" */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${trim(n / 1000)}k`;
  return String(n);
}
function trim(x: number) {
  return x.toFixed(1).replace(/\.0$/, "");
}

/** Fixed UTC formatting so server and client render the same string. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Unknown";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const LICENSE_LABELS: Record<string, string> = {
  NOASSERTION: "Custom",
  "AGPL-3.0": "AGPL-3.0",
  "Apache-2.0": "Apache 2.0",
  MIT: "MIT",
  "CC-BY-4.0": "CC BY 4.0",
};
export function licenseLabel(key: string | null): string {
  if (!key) return "None listed";
  return LICENSE_LABELS[key] ?? key;
}

export const DIFFICULTY_LABEL = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
} as const;

export const KIND_LABEL = {
  app: "App",
  cli: "CLI tool",
  library: "Library",
  framework: "Framework",
  platform: "Platform",
  model: "Model",
  extension: "IDE extension",
} as const;

/** "today", "3 days ago", "4 months ago" relative to a fixed reference time. */
export function timeAgo(iso: string | null | undefined, reference: string): string {
  if (!iso) return "Unknown";
  const days = Math.floor((new Date(reference).getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}
