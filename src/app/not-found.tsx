import { Compass } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="container-page max-w-2xl pt-20">
      <EmptyState
        icon={Compass}
        title="We couldn't find that page"
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href="/">Go home</ButtonLink>
            <ButtonLink href="/search" variant="outline">Search repositories</ButtonLink>
          </div>
        }
      >
        The repository may not be published yet, or the link is out of date. Try{" "}
        <Link href="/categories" className="font-medium text-accent hover:underline">browsing categories</Link>.
      </EmptyState>
    </div>
  );
}
