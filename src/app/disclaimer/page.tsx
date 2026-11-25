import type { Metadata } from "next";
import { DraftNotice, ProsePage } from "@/components/site/prose-page";

export const metadata: Metadata = { title: "Disclaimer", alternates: { canonical: "/disclaimer" } };

export default function Page() {
  return (
    <ProsePage title="Disclaimer">
      <DraftNotice what="disclaimer" />
    </ProsePage>
  );
}
