// One place for the facts the legal pages depend on. Change here, and every page follows.
export const LEGAL = {
  /** General inquiries, feedback, corrections and removal requests. */
  contactEmail: "hello@airepohub.dev",
  /** Problems with the website itself. */
  supportEmail: "support@airepohub.dev",
  /** Privacy and data requests. */
  privacyEmail: "privacy@airepohub.dev",
  /** Date the current Terms and Privacy Policy took effect (YYYY-MM-DD). */
  effectiveDate: "2026-11-27",
} as const;

export const adsEnabled = () => process.env.NEXT_PUBLIC_ADS_ENABLED === "true";
