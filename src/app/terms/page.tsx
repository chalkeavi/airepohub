import type { Metadata } from "next";
import { ProsePage } from "@/components/site/prose-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The rules for using AIRepoHub, and what our guides can and can't promise.",
  alternates: { canonical: "/terms" },
};

export default function Page() {
  const mail = `mailto:${LEGAL.contactEmail}`;
  return (
    <ProsePage title="Terms of Use" intro={`Effective ${LEGAL.effectiveDate}. By using airepohub.dev you agree to these terms.`}>
      <h2>What AIRepoHub is</h2>
      <p>
        <strong>
          Every project on AIRepoHub is a publicly listed GitHub repository, and it belongs entirely to its original
          owner.
        </strong>{" "}
        AIRepoHub doesn&apos;t own, host or sell any of them. It&apos;s simply a collection of these public projects,
        explained in plain English to help people find and use them: what each one does, who it&apos;s for, how to
        install it and what it may cost. We are an independent site, not affiliated with GitHub or with the projects
        we list, and every page links to the original repository.
      </p>

      <h2>How our content is made</h2>
      <ul>
        <li>
          Pages are written from each project&apos;s own public README and GitHub information, linked to the exact
          version we read. Some text is drafted with the help of AI tools and checked automatically against that
          source before it&apos;s published.
        </li>
        <li>
          Star counts, rankings and trends come from GitHub and are refreshed daily, so they can be out of date between
          updates.
        </li>
        <li>
          Install guides are marked with how they were checked. &quot;From official docs&quot; means the steps come from
          the project&apos;s documentation and <strong>we haven&apos;t run them ourselves</strong>.
        </li>
        <li>
          Each guide shows the date and the version of the project it was written from. Projects change after that,
          so commands may need adjusting for newer versions, your operating system or your setup. When in doubt, the
          project&apos;s latest README on GitHub is the authority.
        </li>
        <li>Listing a project is not an endorsement. We don&apos;t accept payment to list, rank or feature projects.</li>
      </ul>

      <h2>Use software at your own risk</h2>
      <p>
        The projects listed here are made by third parties. Before installing anything, read the project&apos;s own
        documentation and license, check what a command does before you run it, and be careful with API keys and
        personal data. Some tools call paid services or need powerful hardware; costs on our pages are guidance, not
        quotes. We aren&apos;t responsible for third-party software, websites or services, or for any loss, damage or
        cost from using them.
      </p>

      <h2>No warranty</h2>
      <p>
        AIRepoHub is provided &quot;as is&quot; and &quot;as available&quot;. We work to keep it accurate but can&apos;t
        promise that every detail is complete, current or error-free, or that the site will always be available. To
        the extent the law allows, we aren&apos;t liable for indirect or consequential losses from using the site.
      </p>

      <h2>Acceptable use</h2>
      <p>Please don&apos;t:</p>
      <ul>
        <li>overload the site with automated requests or try to break, bypass or probe its security;</li>
        <li>copy our written guides in bulk to republish them as your own;</li>
        <li>use the site for anything unlawful.</li>
      </ul>
      <p>Linking to our pages and quoting short passages with a link back is welcome.</p>

      <h2>Trademarks and ownership</h2>
      <p>
        Project names, logos and code belong to their owners and are shown only to identify the projects. Each project
        is covered by its own license. The AIRepoHub name, design and our written explanations belong to AIRepoHub.
      </p>

      <h2>Corrections and removal requests</h2>
      <p>
        If you maintain a project and something on its page is wrong, outdated, or you&apos;d like it removed, email us
        from an address connected to the project and we&apos;ll act on it promptly. The same goes for copyright
        concerns.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms as the site grows (for example if we add ads or accounts). The date at the top shows
        the current version; continuing to use the site means you accept it.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={mail} className="underline">{LEGAL.contactEmail}</a>
      </p>
    </ProsePage>
  );
}
