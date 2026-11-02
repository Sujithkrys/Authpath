import type { ClaimCheck, Guide } from "@/types/guide";

type VerdictFields = Pick<Guide, "diff" | "diffConfirmed" | "setup" | "wait" | "review"> & Partial<Pick<Guide, "checklist" | "incomplete">>;

const MISSING_STEP: Record<string, string> = { create_app: "creating the app", credentials: "getting its credentials" };

/** "~15 min" reads as "about 15 minutes", and "30-60 min" as "30 to 60 minutes". Anything else is used as it is. */
function aboutTime(setup: string): string {
  const range = setup.match(/(\d+)\s*-\s*(\d+)\s*min/);
  if (range) return `${range[1]} to ${range[2]} minutes`;
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
  "sensitive scopes": "You can test with up to 100 test users. Sensitive and restricted scopes need Google's review before you go public.",
  "restricted scopes": "You can test with up to 100 test users. Sensitive and restricted scopes need Google's review before you go public.",
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
export function verdictLine({ diff, diffConfirmed, setup, wait, review, checklist, incomplete }: VerdictFields): string {
  // An incomplete guide says so first, and claims no setup time: its steps aren't the whole setup.
  if (incomplete && incomplete.length > 0) {
    const missing = incomplete.map((step) => MISSING_STEP[step] ?? step).join(" or ");
    return `Incomplete guide: the docs we read didn't give a step for ${missing}, so this isn't the full setup. Check the official docs before you start.`;
  }
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

/**
 * What the checker did, and, when steps carry "Not confirmed" for another
 * reason, why: a step with no source page has nothing to check against. The
 * count and the step tags then can't seem to disagree.
 */
export function describeClaimCheck({ checked, downgraded, dropped }: ClaimCheck, steps?: { e: string; source?: string }[]): string {
  const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
  const parts = [dropped > 0 && `${plural(dropped, "claim")} removed`, downgraded > 0 && `${downgraded} marked uncertain`].filter(Boolean);
  const checkedPart =
    parts.length > 0 ? `${plural(checked, "claim")} checked, ${parts.join(", ")}` : `all ${plural(checked, "claim")} it checked are supported`;
  const unsourced = steps?.filter((step) => step.e === "uncertain" && !step.source).length ?? 0;
  if (unsourced === 0) return checkedPart;
  return `${checkedPart}. ${plural(unsourced, "step")} had no source page to check against, so ${unsourced === 1 ? "it shows" : "they show"} "Not confirmed"`;
}

/**
 * Guides generated from this version on use the newer display rules (the agent
 * panel built from step owners, the checker line below). Guides saved earlier
 * keep showing exactly what they showed when they were made.
 */
export const NEW_RULES_VERSION = 6;

export const usesNewRules = (guide: { generated?: boolean; version?: number }) => Boolean(guide.generated) && (guide.version ?? 0) >= NEW_RULES_VERSION;

/** The header line exactly as guides saved before version 6 show it. */
export function claimCheckLineBefore6({ checked, downgraded, dropped }: ClaimCheck): string {
  const parts = [dropped > 0 && `${dropped} ${dropped === 1 ? "claim" : "claims"} removed`, downgraded > 0 && `${downgraded} marked uncertain`].filter(Boolean);
  if (parts.length > 0) return `Checked against cited pages: ${parts.join(", ")}`;
  return `Checked against cited pages: all ${checked} ${checked === 1 ? "claim" : "claims"} supported`;
}
