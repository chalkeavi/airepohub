import type { Metadata } from "next";
import { DraftNotice, ProsePage } from "@/components/site/prose-page";

export const metadata: Metadata = { title: "Terms of Use", alternates: { canonical: "/terms" } };

export default function Page() {
  return (
    <ProsePage title="Terms of Use">
      <DraftNotice what="terms of use" />
    </ProsePage>
  );
}
