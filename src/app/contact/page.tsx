import type { Metadata } from "next";
import { ProsePage } from "@/components/site/prose-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with AIRepoHub for feedback, suggestions, corrections or privacy requests.",
  alternates: { canonical: "/contact" },
};

const ADDRESSES = [
  { email: LEGAL.contactEmail, what: "General inquiries, feedback and suggestions" },
  { email: LEGAL.supportEmail, what: "Website support" },
  { email: LEGAL.privacyEmail, what: "Privacy and data requests" },
];

export default function Page() {
  return (
    <ProsePage title="Contact" intro="We'd love to hear from you. Get in touch for any feedback, suggestion or concern.">
      <div className="not-prose overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-muted text-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Email address</th>
              <th className="px-4 py-3 font-medium">For</th>
            </tr>
          </thead>
          <tbody>
            {ADDRESSES.map((a) => (
              <tr key={a.email} className="border-t border-border">
                <td className="px-4 py-3">
                  <a href={`mailto:${a.email}`} className="font-medium text-accent hover:underline">
                    {a.email}
                  </a>
                </td>
                <td className="px-4 py-3">{a.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Suggest a repository</h2>
      <p>
        Know an open-source AI project that should be listed? Email {LEGAL.contactEmail} with the GitHub link.
      </p>

      <h2>For project owners</h2>
      <p>
        Every project listed here belongs to its original owner. If something on your project&apos;s page is wrong or
        outdated, or you&apos;d like it removed, email {LEGAL.contactEmail} from an address connected to the project
        and we&apos;ll act on it promptly.
      </p>
    </ProsePage>
  );
}
