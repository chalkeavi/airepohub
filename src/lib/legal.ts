// One place for the facts the legal pages depend on. Change here, and every page follows.
export const LEGAL = {
  /** Where visitors and repository owners write to us. */
  contactEmail: "CONTACT_EMAIL_PLACEHOLDER",
  /** Date the current Terms and Privacy Policy took effect (YYYY-MM-DD). */
  effectiveDate: "2026-11-27",
} as const;

export const adsEnabled = () => process.env.NEXT_PUBLIC_ADS_ENABLED === "true";
