import {
  Bot,
  Clapperboard,
  Code,
  Cpu,
  Image,
  Library,
  Sparkles,
  TrendingUp,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  bot: Bot,
  code: Code,
  cpu: Cpu,
  workflow: Workflow,
  "trending-up": TrendingUp,
  image: Image,
  clapperboard: Clapperboard,
  library: Library,
  wrench: Wrench,
  sparkles: Sparkles,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon className={className} aria-hidden />;
}
