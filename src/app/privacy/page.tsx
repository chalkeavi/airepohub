import type { Metadata } from "next";
import { ProsePage } from "@/components/site/prose-page";
import { adsEnabled, LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What AIRepoHub collects (very little), why, and the choices you have.",
  alternates: { canonical: "/privacy" },
};

export default function Page() {
  const mail = `mailto:${LEGAL.privacyEmail}`;
  return (
    <ProsePage title="Privacy Policy" intro={`Effective ${LEGAL.effectiveDate}. The short version: you can use AIRepoHub without an account, and we don't track you.`}>
      <h2>Who we are</h2>
      <p>
        AIRepoHub (airepohub.dev) is a free directory that explains open-source AI projects from GitHub in plain
        English. In this policy, &quot;we&quot; means the people who run AIRepoHub.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>No accounts, no forms, no sign-up.</strong> Visitors never give us a name, email address or password.
        </li>
        <li>
          <strong>No analytics or tracking scripts.</strong> We don&apos;t use Google Analytics, tracking pixels or
          fingerprinting, and we don&apos;t build profiles of visitors.
        </li>
        <li>
          <strong>What you type in search</strong> is sent to our server to find matching repositories. We use it only
          to answer that search and don&apos;t store it with anything that identifies you.
        </li>
        <li>
          <strong>Server logs.</strong> Our hosting provider, Cloudflare, briefly processes technical data that every
          website receives, such as your IP address, browser type and the page requested, to deliver the site and
          protect it from abuse. See{" "}
          <a href="https://www.cloudflare.com/privacypolicy/" className="underline">Cloudflare&apos;s privacy policy</a>.
        </li>
        <li>
          <strong>If you email us</strong>, we keep your message and address only to reply and to act on what you asked.
        </li>
      </ul>

      <h2>Cookies and local storage</h2>
      <p>
        AIRepoHub sets no cookies of its own. If you switch between light and dark mode, that choice is saved in your
        browser&apos;s local storage so the site remembers it. It never leaves your device, and you can clear it at any
        time in your browser settings.
      </p>

      {adsEnabled() ? (
        <>
          <h2>Advertising</h2>
          <p>
            We show ads through Google AdSense to keep AIRepoHub free. Google and its partners use cookies to show ads
            and measure them, which can include ads based on your visits to this and other websites. You can turn off
            personalised ads at <a href="https://adssettings.google.com" className="underline">Google Ads Settings</a>{" "}
            or opt out of many third-party vendors at{" "}
            <a href="https://www.aboutads.info/choices/" className="underline">aboutads.info</a>. Learn how Google uses
            data at{" "}
            <a href="https://policies.google.com/technologies/partner-sites" className="underline">
              policies.google.com/technologies/partner-sites
            </a>
            . Where the law requires it (for example in the EU, UK and some US states), we ask for your consent before
            these cookies are used.
          </p>
        </>
      ) : (
        <>
          <h2>Advertising</h2>
          <p>
            AIRepoHub shows no ads today. We may add Google AdSense later to keep the site free; if we do, we&apos;ll
            update this policy first and explain the cookies it uses and how to opt out.
          </p>
        </>
      )}

      <h2>Content loaded from other sites</h2>
      <p>
        Project logos and owner avatars are loaded from GitHub, so GitHub receives the usual technical request data
        when you view them. Links to GitHub repositories, project websites and documentation take you to sites with
        their own privacy policies, which we don&apos;t control.
      </p>

      <h2>Data about repositories</h2>
      <p>
        Repository pages are built from public information on GitHub (name, description, stars, license, README) and
        written in our own words. Owners who want something corrected or removed can email us (see below).
      </p>

      <h2>How long we keep data and who we share it with</h2>
      <p>
        We don&apos;t sell or rent personal data, and we don&apos;t share it except with the service providers that run
        the site (Cloudflare for hosting, Supabase for our database of repositories) or when the law requires it. Emails
        are deleted once they&apos;re no longer needed.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live (for example under the GDPR or the California CCPA), you may have the right to ask
        what personal data we hold about you, to have it corrected or deleted, and to object to its use. Since we hold
        almost nothing, the main case is email you sent us; write to us and we&apos;ll handle it within 30 days.
      </p>

      <h2>Children</h2>
      <p>AIRepoHub is a general-audience site and isn&apos;t aimed at children under 13. We don&apos;t knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>If we change this policy, we&apos;ll update the date at the top. Significant changes, like turning on ads, will be noted here first.</p>

      <h2>Contact</h2>
      <p>
        Questions or requests: <a href={mail} className="underline">{LEGAL.privacyEmail}</a>
      </p>
    </ProsePage>
  );
}
