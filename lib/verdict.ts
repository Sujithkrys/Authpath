import type { Guide } from "@/types/guide";

type VerdictFields = Pick<Guide, "diff" | "diffConfirmed" | "setup" | "wait" | "review"> & Partial<Pick<Guide, "checklist">>;

/** "~15 min" reads as "about 15 minutes". Anything else is used as it is. */
function aboutTime(setup: string): string {
  const minutes = setup.match(/(\d+)\s*min/)?.[1];
  return minutes ? `about ${minutes} minutes` : setup;
}

/** A wait worth stating: a real duration, not "None" or a pointer to the timeline. */
function statedWait(wait: string): string | null {
  return /^(none|not published|see review timeline)$/i.test(wait.trim()) ? null : wait.trim().toLowerCase();
}

const REVIEW_SENTENCE: Record<string, string> = {
  required: "A review is required before real users can connect.",
  "security assessment": "A security assessment is required before real users can connect.",
  "partner program": "A partner program is required before real users can connect.",
  "paid plan": "A paid plan is required before real users can connect.",
  "light verification": "Light verification is needed.",
  "to lift limits": "It works with limits until you're reviewed.",
  "sensitive scopes": "Sensitive scopes need a review.",
  "to publish": "A review is needed to publish.",
  "platform profile": "A completed platform profile is needed first.",
  unclear: "The approval process couldn't be confirmed.",
};

/** "Marketplace only" becomes "the Marketplace", "AppExchange only" stays a name, "Listing only" is generic. */
function listingName(review: string): string | null {
  const name = review.trim().match(/^(.+) only$/i)?.[1];
  if (!name) return null;
  if (/^listing$/i.test(name)) return "its marketplace";
  return /^marketplace$/i.test(name) ? "the Marketplace" : name;
}

/**
 * One plain sentence for the top of a guide, built only from what it already
 * stores: "Self-serve in about 15 minutes. No review needed unless you list on the Marketplace."
 */
export function verdictLine({ diff, diffConfirmed, setup, wait, review, checklist }: VerdictFields): string {
  const time = aboutTime(setup);
  const opening = diff === "easy" ? `Self-serve in ${time}.` : `Takes ${time} to set up.`;

  // A wait is only stated when a cited page publishes a timeline. Otherwise the tile alone shows it.
  const timelineFound = !checklist || checklist.some((item) => item.key === "review_timeline" && item.status === "found");
  const known = timelineFound ? statedWait(wait) : null;
  const listing = listingName(review);
  const reviewKey = review.trim().toLowerCase();

  let approval: string;
  if (reviewKey === "no") approval = "No review needed.";
  else if (listing) approval = diff === "hard" ? `A review applies if you list on ${listing}.` : `No review needed unless you list on ${listing}.`;
  else approval = REVIEW_SENTENCE[reviewKey] ?? `Approval needed: ${review.trim().toLowerCase()}.`;

  // An optional listing's wait doesn't matter to an easy setup. On a hard guide the
  // published wait may belong to a lighter review than the one required, so the
  // sentence leaves it to the Approval wait stat.
  const showWait = known && reviewKey !== "no" && diff !== "hard" && !(diff === "easy" && listing);
  const waitSentence = !showWait ? "" : listing ? ` That review can take ${known}.` : ` Expect a wait of ${known}.`;
  const estimate = diff !== "unknown" && diffConfirmed === false ? " This rating is a best estimate." : "";
  return `${opening} ${approval}${waitSentence}${estimate}`;
}
