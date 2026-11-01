/** The live site's address. NEXT_PUBLIC_SITE_URL overrides it, e.g. for a preview deployment. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://authpath-sujith.vercel.app").replace(/\/+$/, "");
