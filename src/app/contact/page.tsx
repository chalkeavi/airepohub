import type { Metadata } from "next";
import { DraftNotice, ProsePage } from "@/components/site/prose-page";

export const metadata: Metadata = { title: "Contact", alternates: { canonical: "/contact" } };

export default function Page() {
  return (
    <ProsePage title="Contact">
      <DraftNotice what="contact page" />
    </ProsePage>
  );
}
