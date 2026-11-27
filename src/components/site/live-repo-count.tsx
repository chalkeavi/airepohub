"use client";

import { useEffect, useState } from "react";

/** Shows the cached count right away, then the live one from /api/stats. Keeps the cached number on any error. */
export function LiveRepoCount({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/stats", { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ repositories?: number }>) : null))
      .then((d) => {
        if (d && typeof d.repositories === "number" && d.repositories > 0) setCount(d.repositories);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);
  return <>{count.toLocaleString("en-US")}</>;
}
