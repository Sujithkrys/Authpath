import github from "@/data/guides/github.json";
import gmail from "@/data/guides/gmail.json";
import google from "@/data/guides/google.json";
import hubspot from "@/data/guides/hubspot.json";
import notion from "@/data/guides/notion.json";
import salesforce from "@/data/guides/salesforce.json";
import slack from "@/data/guides/slack.json";
import stripe from "@/data/guides/stripe.json";
import zoom from "@/data/guides/zoom.json";
import { getLogoSrc } from "@/lib/logos";
import type { Guide, GuideWithLogo } from "@/types/guide";

export const withLogo = (guide: Guide): GuideWithLogo => ({ ...guide, logoSrc: getLogoSrc(guide.id) });

// Static imports, so the JSON is bundled at build time. This order is the
// order cards appear in the library.
const listed = ([github, slack, gmail, salesforce, stripe, notion, hubspot, zoom] as unknown as Guide[]).map(withLogo);

// Still served at /guides/<id> and found by name, but not shown as a card. The
// Google page is linked from outside the site, so it has to keep working after
// Gmail took its place in the library.
const unlisted = ([google] as unknown as Guide[]).map(withLogo);
const everyGuide = [...listed, ...unlisted];

export function getLibraryGuides(): GuideWithLogo[] {
  return listed;
}

export function getLibraryGuide(slug: string): GuideWithLogo | undefined {
  return everyGuide.find((guide) => guide.id === slug);
}

const lastTwoLabels = (host: string) => host.split(".").slice(-2).join(".");

/** Google's own hosts belong to more than one guide, so these are matched by name. */
const HOST_HINTS: Record<string, string> = {
  "gmail.com": "gmail",
  "mail.google.com": "gmail",
  "google.com": "google",
  "cloud.google.com": "google",
  "console.cloud.google.com": "google",
};

/** Matches an app name or a URL on one of the provider's domains, e.g. "Slack" or api.slack.com/apps. */
export function findLibraryGuide(input: string): GuideWithLogo | undefined {
  const text = input.trim().toLowerCase();
  const host = text
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];

  const byName = everyGuide.find((guide) => guide.name.toLowerCase() === text || guide.id === text);
  if (byName) return byName;
  if (!host.includes(".")) return undefined;

  const hinted = HOST_HINTS[host];
  if (hinted) return everyGuide.find((guide) => guide.id === hinted);

  // A site shared by several guides can't be told apart by its domain alone.
  const sameSite = everyGuide.filter((guide) => lastTwoLabels(host) === lastTwoLabels(guide.site.split("/")[0]));
  return sameSite.length === 1 ? sameSite[0] : undefined;
}
