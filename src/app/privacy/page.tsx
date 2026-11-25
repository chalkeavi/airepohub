import type { Metadata } from "next";
import { DraftNotice, ProsePage } from "@/components/site/prose-page";

export const metadata: Metadata = { title: "Privacy Policy", alternates: { canonical: "/privacy" } };

export default function Page() {
  return (
    <ProsePage title="Privacy Policy">
      <DraftNotice what="privacy policy" />
    </ProsePage>
  );
}
