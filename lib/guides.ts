import linear from "@/data/generated/linear.json";
import github from "@/data/guides/github.json";
import google from "@/data/guides/google.json";
import hubspot from "@/data/guides/hubspot.json";
import notion from "@/data/guides/notion.json";
import salesforce from "@/data/guides/salesforce.json";
import slack from "@/data/guides/slack.json";
import stripe from "@/data/guides/stripe.json";
import zoom from "@/data/guides/zoom.json";
import { getLogoPath } from "@/lib/logos";
import type { Guide, GuideWithLogo } from "@/types/guide";

const withLogo = (guide: Guide): GuideWithLogo => ({ ...guide, logoPath: getLogoPath(guide.id) });

// Static imports, so the JSON is bundled at build time. This order is the
// order cards appear in the library.
const libraryGuides = ([github, slack, google, salesforce, stripe, notion, hubspot, zoom] as unknown as Guide[]).map(
  withLogo,
);

// The sample result the fake generator opens. Not listed in the library.
const generatedGuides = ([linear] as unknown as Guide[]).map(withLogo);

export function getLibraryGuides(): GuideWithLogo[] {
  return libraryGuides;
}

export function getAllGuides(): GuideWithLogo[] {
  return [...libraryGuides, ...generatedGuides];
}

export function getGuide(slug: string): GuideWithLogo | undefined {
  return getAllGuides().find((guide) => guide.id === slug);
}
