import { jsonLdString } from "@/lib/seo";

/** Structured data for search engines. Content is serialized with "<" escaped. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
