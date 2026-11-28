import { ImageResponse } from "next/og";

// Share-card renderer for Open Graph / Twitter images (1200×630). Text only, default font,
// no external fetches, so it renders the same at build time and on the server.
export const OG_SIZE = { width: 1200, height: 630 };

const INK = "#18261e";
const MUTED = "#56655b";
const ACCENT = "#2f6b47";
const BG = "#f6f5ee";

export function ogCard({ eyebrow, title, subtitle, chips = [] }: { eyebrow: string; title: string; subtitle?: string; chips?: string[] }) {
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: 72, background: BG, color: INK }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 700 }}>
          <div style={{ display: "flex", width: 52, height: 52, borderRadius: 8, background: INK }} />
          <div style={{ display: "flex", letterSpacing: -0.5 }}>
            AIRepo<span style={{ color: ACCENT }}>Hub</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 26, color: ACCENT, textTransform: "uppercase", letterSpacing: 3 }}>{eyebrow}</div>
          <div style={{ fontSize: title.length > 28 ? 64 : 84, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 32, color: MUTED, lineHeight: 1.35, maxWidth: 1000 }}>{subtitle}</div>}
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 24 }}>
          {chips.map((c) => (
            <div key={c} style={{ display: "flex", padding: "8px 18px", borderRadius: 4, border: `2px solid #d6d9c8`, color: INK }}>
              {c}
            </div>
          ))}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
