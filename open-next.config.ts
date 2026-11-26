import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue";

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  // Without a queue OpenNext uses a "dummy" one: stale pages are served forever and never re-render,
  // so data published after a deploy (guides, new repos) never shows. The memory queue re-renders
  // a stale page in the background through the WORKER_SELF_REFERENCE binding in wrangler.jsonc.
  queue: memoryQueue,
});
