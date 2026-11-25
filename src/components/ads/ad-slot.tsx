/**
 * Placeholder for future AdSense units. Renders nothing until ads are approved and
 * NEXT_PUBLIC_ADS_ENABLED=true. Keep slots between content sections, away from navigation.
 */
export function AdSlot({ slot, className }: { slot: string; className?: string }) {
  if (process.env.NEXT_PUBLIC_ADS_ENABLED !== "true") return null;
  return (
    <aside aria-label="Advertisement" data-ad-slot={slot} className={className}>
      <p className="eyebrow mb-2 text-center">Advertisement</p>
      <div className="min-h-[120px] rounded-xl border border-dashed border-border" />
    </aside>
  );
}
