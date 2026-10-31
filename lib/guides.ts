import github from "@/data/guides/github.json";
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
const libraryGuides = ([github, slack, google, salesforce, stripe, notion, hubspot, zoom] as unknown as Guide[]).map(
  withLogo,
);

export function getLibraryGuides(): GuideWithLogo[] {
  return libraryGuides;
}

export function getLibraryGuide(slug: string): GuideWithLogo | undefined {
  return libraryGuides.find((guide) => guide.id === slug);
}

const lastTwoLabels = (host: string) => host.split(".").slice(-2).join(".");

/** Matches an app name or a URL on one of the provider's domains, e.g. "Slack" or api.slack.com/apps. */
export function findLibraryGuide(input: string): GuideWithLogo | undefined {
  const text = input.trim().toLowerCase();
  const host = text
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];

  return libraryGuides.find(
    (guide) =>
      guide.name.toLowerCase() === text ||
      guide.id === text ||
      (host.includes(".") && lastTwoLabels(host) === lastTwoLabels(guide.site.split("/")[0])),
  );
}
