/**
 * Writing, owner and difficulty rules, enforced in code. The prompts describe
 * them too, but the model's output is only trusted once it passes these.
 */

import { hostOf, isUnder } from "@/lib/agent/urls";
import { THIRD_PARTY_DOMAINS, baseDomain, isOfficialHost } from "@/lib/agent/sources";
import type { Difficulty, StepOwner } from "@/types/guide";

/* ---------- Owner ---------- */

/**
 * Anything that needs the developer's account, money, legal standing or
 * patience. Matching any of these forces "you", whatever the model chose.
 */
const NEEDS_THE_DEVELOPER: RegExp[] = [
  /\bsign(s|ed|ing)? ?(in|up|on)\b/i,
  /\blog(s|ged|ging)? ?(in|on)\b/i,
  /\b(create|creating|register|registering|add|adding|set up|setting up|make|making|install|installing)\b.{0,40}\b(app|application|client|project|integration|bot|workspace)\b/i,
  /\b(console|dashboard|portal|developer settings|admin (panel|settings))\b/i,
  /\b(click|press|tap)\b/i,
  /\bsubmit(s|ted|ting)?\b|\bsubmission\b/i,
  /\bverif(y|ies|ied|ying|ication)\b/i,
  /\bupload(s|ed|ing)?\b/i,
  /\b(pay|pays|paid|paying|payment|billing|purchase|subscribe|subscription|upgrade)\b/i,
  /\bwait(s|ed|ing)?\b/i,
  /\b(approv(e|al|ed)|review(ed|ing)?|assessment|audit)\b/i,
  /\b(contact|email|e-mail) (the|their|support|sales|us)\b/i,
  /\b(legal|contract|agreement|terms of service|terms|business|company details|identity|documents?)\b/i,
  /\b(copy|copying|store|storing|save|saving|rotate|download)\b.{0,30}\b(secret|key|credential|token|client id)\b/i,
  /\b(invite|grant|authori[sz]e|consent|accept)\b/i,
];

/** The only kinds of work an agent may own. */
const AGENT_CAN_DO: RegExp[] = [
  /\b(draft|drafting|write|writing|compose|composing)\b/i,
  /\b(build|building|construct|constructing|form|forming|format|formatting)\b.{0,30}\b(redirect|callback)\b/i,
  /\b(redirect|callback) (uri|url)s?\b/i,
  /\b(choose|choosing|pick|picking|select|selecting|list|listing|decide|deciding|determine|determining)\b.{0,30}\bscopes?\b/i,
  /\b(prepare|preparing|fill|filling|gather|gathering)\b.{0,30}\b(form|value|values|field|fields|details|answers)\b/i,
];

/**
 * "agent" only survives when the step is drafting text, building a redirect
 * URI, choosing scopes or preparing form values, and touches nothing that
 * needs the developer. Wrongly handing a step to the developer is the safe mistake.
 */
export function resolveOwner(proposed: StepOwner, title: string, description: string): StepOwner {
  if (proposed !== "agent") return "you";
  const text = `${title} ${description.replace(/<code>[\s\S]*?<\/code>/g, " ")}`;
  if (NEEDS_THE_DEVELOPER.some((pattern) => pattern.test(text))) return "you";
  return AGENT_CAN_DO.some((pattern) => pattern.test(text)) ? "agent" : "you";
}

/* ---------- Writing ---------- */

export const MIN_STEPS = 3;
export const MAX_STEPS = 8;
/** Title and description together, counting a <code> value as one word. */
export const MAX_STEP_WORDS = 25;
const MAX_TITLE_WORDS = 8;
const MAX_CODE_WORDS = 6;
const MAX_LINK_LABEL_WORDS = 7;

/** Imperative verbs a setup step can start with. */
const STEP_VERBS = new Set(
  `open go visit navigate sign log create register add enter type set choose select pick copy paste save store keep
  generate request submit configure enable disable install click download upload verify review wait note define list
  build fill provide name give apply publish distribute test invite grant authorize authorise exchange call use implement
  read check confirm complete connect link find specify upgrade contact agree accept edit update record rotate revoke
  prepare draft write describe attach ensure make start finish switch turn toggle allow map decide determine obtain get
  retrieve fetch send redirect handle protect secure move launch deploy plan schedule follow add replace include whitelist
  allowlist append restrict limit reduce remove delete answer complete pass meet supply upload host serve point register
  share join apply request verify list describe enrol enroll email notify declare identify assign designate activate
  customize customise`.split(/\s+/),
);

/** Text with <code> values replaced by one placeholder word each. */
const withCodeAsWords = (text: string) => text.replace(/<code>[\s\S]*?<\/code>/g, " CODE ");
export const wordCount = (text: string) => withCodeAsWords(text).split(/\s+/).filter(Boolean).length;

const RAW_URL = /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|dev|io|app|org|net|co|us|so|ai|eu|uk|de)\/[^\s<]*/i;

const codeValues = (text: string) => [...text.matchAll(/<code>([\s\S]*?)<\/code>/g)].map((match) => match[1]);

/** True when a <code> value looks like something a person pastes, not a phrase. */
function isCopyableValue(value: string, domains: string[]): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.split(/\s+/).length > MAX_CODE_WORDS || /[.!?]$/.test(trimmed)) return false;
  // A provider's own URL belongs in a link, not in code to paste.
  const host = /^https?:\/\//.test(trimmed) ? hostOf(trimmed) : null;
  return !(host && isOfficialHost(host, domains));
}

/**
 * A step link may go anywhere on the provider's own registrable domains,
 * including consoles that need a login, but never to a third party.
 */
export function isProviderLink(url: string, domains: string[]): boolean {
  const host = url.startsWith("https://") ? hostOf(url) : null;
  if (!host || THIRD_PARTY_DOMAINS.some((domain) => isUnder(host, domain))) return false;
  return domains.some((domain) => isUnder(host, baseDomain(domain)));
}

export interface StepDraftLike {
  title: string;
  description: string;
  link: { label: string; url: string } | null;
}

/**
 * Checks the writing rules. Returns the problems in words the model can act on,
 * or an empty list. `minSteps` is lower after the checker has removed claims.
 */
export function writingProblems(steps: StepDraftLike[], domains: string[], minSteps = MIN_STEPS): string[] {
  const problems: string[] = [];
  if (steps.length < minSteps || steps.length > MAX_STEPS) {
    problems.push(`Write between ${minSteps} and ${MAX_STEPS} steps; you wrote ${steps.length}.`);
  }

  steps.forEach((step, index) => {
    const at = `Step ${index + 1} ("${step.title}")`;
    const firstWord = step.title.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
    if (!STEP_VERBS.has(firstWord)) problems.push(`${at} must start with an imperative verb, e.g. "Open", "Add", "Copy".`);

    const words = wordCount(step.title) + wordCount(step.description);
    if (words > MAX_STEP_WORDS) problems.push(`${at} has ${words} words; title and description together must be ${MAX_STEP_WORDS} or fewer.`);
    if (wordCount(step.title) > MAX_TITLE_WORDS) problems.push(`${at} title must be ${MAX_TITLE_WORDS} words or fewer.`);

    const sentences = withCodeAsWords(step.description).split(/[.!?](\s|$)/).filter((part) => part && part.trim()).length;
    if (sentences > 2) problems.push(`${at} must be a single action: one or two short sentences, not ${sentences}.`);

    const outsideCode = `${step.title} ${step.description.replace(/<code>[\s\S]*?<\/code>/g, " ")}`;
    if (RAW_URL.test(outsideCode)) problems.push(`${at} contains a raw URL. Put it in link.url with a label, not in the text.`);
    if (/<(?!\/?code>)[a-z/][^>]*>/i.test(step.description)) problems.push(`${at} uses markup other than <code>.`);

    for (const value of codeValues(`${step.title} ${step.description}`)) {
      if (!isCopyableValue(value, domains)) {
        problems.push(`${at} puts "${value.slice(0, 60)}" in <code>. Only values someone pastes (redirect URIs, scope names, field names) go in <code>.`);
      }
    }

    if (step.link) {
      if (!isProviderLink(step.link.url, domains)) {
        problems.push(`${at} links to ${step.link.url}, which isn't on the provider's own domain.`);
      }
      if (RAW_URL.test(step.link.label) || wordCount(step.link.label) > MAX_LINK_LABEL_WORDS || !step.link.label.trim()) {
        problems.push(`${at} needs a short link label like "Open the developer console", not a URL.`);
      }
    }
  });

  return problems;
}

/* ---------- Difficulty ---------- */

/**
 * What stands between a working app and real users connecting at scale, as the
 * approval stage found it. The model reports what the pages show, each with a
 * quote; code decides the rating.
 */
export const GATES = [
  "none",
  "listing_only",
  "limited",
  "light_verification",
  "mandatory_review",
  "security_assessment",
  "partner_program",
  "paid_plan",
  "unknown",
] as const;
export type Gate = (typeof GATES)[number];

/**
 * Can real users connect at scale without a review?
 * Easy: yes, and any review is only for an optional listing.
 * Moderate: yes, but with limits until reviewed or certified, or light verification.
 * Hard: a review, assessment, partner program or paid plan comes first, for some or all common scopes.
 */
const GATE_DIFFICULTY: Record<Gate, Difficulty> = {
  none: "easy",
  listing_only: "easy",
  limited: "moderate",
  light_verification: "moderate",
  mandatory_review: "hard",
  security_assessment: "hard",
  partner_program: "hard",
  paid_plan: "hard",
  unknown: "unknown",
};

/** Strictest last, so the strictest gate with evidence decides the rating. */
const STRICTNESS: Gate[] = ["unknown", "none", "listing_only", "limited", "light_verification", "paid_plan", "partner_program", "mandatory_review", "security_assessment"];

/** What each gate means, in words a reader can use as the reason. */
export const GATE_MEANING: Record<Gate, string> = {
  none: "you register the app yourself, and the review pages read describe no review before real users connect",
  listing_only: "real users can connect without review; review is only for an optional marketplace or directory listing",
  limited: "apps work without review, but with limits until they're reviewed or certified",
  light_verification: "light business or brand verification is needed",
  mandatory_review: "a review or verification is required before real users can connect, for some or all scopes",
  security_assessment: "a security assessment is required before real users can connect, for some or all scopes",
  partner_program: "a partner program is required before real users can connect",
  paid_plan: "a paid plan is required before real users can connect",
  unknown: "no supporting quote was found in the official pages read",
};

/**
 * What the checker holds a gate's quoted page against: only what such a quote can
 * show, in the page's own terms. "For some or all scopes" matters: a provider
 * that gates only sensitive scopes still gates real users.
 */
export const GATE_CLAIM: Record<Gate, string> = {
  none: "developers can create and register an app themselves from their own account",
  listing_only: "apps are reviewed before they can be listed in a public directory or marketplace",
  limited: "apps have limits, such as a user, connection or rate cap, until they are reviewed or certified",
  light_verification: "a business, brand or domain verification applies to apps",
  mandatory_review: "a review or verification is required for apps, for some or all scopes",
  security_assessment: "a security assessment is required for apps, for some or all scopes",
  partner_program: "joining a partner program is required for apps",
  paid_plan: "a paid plan is required for apps",
  unknown: "the approval process is not documented",
};

/** Short "Review needed" label for each gate. */
export const GATE_REVIEW_LABEL: Record<Gate, string> = {
  none: "No",
  listing_only: "Listing only",
  limited: "To lift limits",
  light_verification: "Light verification",
  mandatory_review: "Required",
  security_assessment: "Security assessment",
  partner_program: "Partner program",
  paid_plan: "Paid plan",
  unknown: "Unclear",
};

/** A review answer about getting listed rather than getting access. */
const LISTING_TERMS = /\b(marketplace|app store|app directory|directory|listing|listed|publish(ed|ing)? (to|in|on) )/i;
/** A review page whose path says it's about a marketplace or app store listing. */
const LISTING_PATH = /[/\-_](marketplace|app-?store|app-?directory|listing)([/\-_.]|$)/i;
/** A review answer saying apps must pass something. */
const REQUIRED_REVIEW = /\b(requires?|required|must|need(s|ed)?)\b.{0,80}\b(verif|review|assess|audit)|\b(verif\w*|review|assessment|audit)\b.{0,40}\b(is|are)?\s*(required|mandatory)\b/i;

export interface GateCandidate {
  gate: Gate;
  detail: string;
  /** The quote was found word for word on an official page read this run. */
  quoteHolds: boolean;
  /** The checker's verdict on the gate against that page, if it was asked. */
  verdict?: "yes" | "partly" | "no";
}

export interface GateEvidence {
  /** Every gate the approval stage proposed. */
  candidates: GateCandidate[];
  /** The checklist answers, after the checker. */
  review?: { status: string; answer: string; source?: string };
  registration?: { status: string };
  limits?: { status: string; answer: string };
  /** Whether the research proposed any review answer at all, before the checker. */
  reviewProposed: boolean;
}

export interface GateDecision {
  gate: Gate;
  detail: string;
  /** False when the evidence is real but the checker only partly agreed. */
  confirmed: boolean;
}

/** Status to confirmation: a found answer is confirmed, an uncertain one is an estimate, anything else is no evidence. */
const fromStatus = (status: string | undefined): "yes" | "partly" | "no" =>
  status === "found" ? "yes" : status === "uncertain" ? "partly" : "no";

/**
 * Decides the gate from evidence, not the model's pick. The strictest gate with
 * support wins, so finding "marketplace review" can't hide "security assessment".
 * - A gate needs its quote on a page. The checker's "no" removes it; "partly"
 *   keeps it as a best estimate, marked not fully confirmed.
 * - Checklist answers count too: limits mean "limited", a review about a listing
 *   means "listing_only", and a review apps must pass is a hard best estimate.
 * - Easy by absence needs confirmed self-serve registration and no review found.
 * - "unknown" is only for when nothing supports any gate.
 */
export function decideGate(evidence: GateEvidence): GateDecision {
  const { candidates, review, registration, limits, reviewProposed } = evidence;
  const supported: { gate: Gate; detail: string; confirmed: boolean }[] = candidates
    .filter(({ gate, quoteHolds, verdict }) => gate !== "unknown" && !(gate === "none" && reviewProposed) && quoteHolds && verdict !== "no")
    .map(({ gate, detail, verdict }) => ({ gate, detail, confirmed: verdict === "yes" }));

  const limitStatus = fromStatus(limits?.status);
  if (limitStatus !== "no") supported.push({ gate: "limited", detail: "", confirmed: limitStatus === "yes" });

  const reviewStatus = fromStatus(review?.status);
  if (reviewStatus !== "no" && review) {
    const aboutListing = LISTING_TERMS.test(review.answer) || LISTING_PATH.test(review.source ?? "");
    if (aboutListing) supported.push({ gate: "listing_only", detail: "", confirmed: reviewStatus === "yes" });
    else if (REQUIRED_REVIEW.test(review.answer)) supported.push({ gate: "mandatory_review", detail: "", confirmed: false });
  }

  if (supported.length > 0) {
    const strictest = supported.reduce((best, next) => {
      const [bestRank, nextRank] = [STRICTNESS.indexOf(best.gate), STRICTNESS.indexOf(next.gate)];
      if (nextRank !== bestRank) return nextRank > bestRank ? next : best;
      return next.confirmed && !best.confirmed ? next : best;
    });
    return strictest;
  }

  // A gate the research suspected but couldn't prove is Unknown, never Easy.
  const suspected = candidates.some(({ gate }) => STRICTNESS.indexOf(gate) > STRICTNESS.indexOf("listing_only"));
  const registered = fromStatus(registration?.status);
  // No review can only be concluded from review pages that were read.
  const reviewUnread = review?.status === "unreadable";
  if (!reviewProposed && !suspected && !reviewUnread && registered !== "no") return { gate: "none", detail: "", confirmed: registered === "yes" };
  return { gate: "unknown", detail: "", confirmed: false };
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The one-line reason: the model's specific wording if it's short, else what the gate means. */
export function difficultyFor(decision: GateDecision): { diff: Difficulty; reason: string; confirmed: boolean } {
  const { gate, detail, confirmed } = decision;
  const diff = GATE_DIFFICULTY[gate];
  const specific = detail.trim().replace(/\.$/, "");
  const reason = gate !== "unknown" && specific && specific.length <= 110 ? specific : GATE_MEANING[gate];
  const estimate = gate !== "unknown" && !confirmed ? " (the cited page only partly confirms this)" : "";
  return { diff, reason: `${capitalize(diff)}: ${reason}${estimate}`, confirmed: gate !== "unknown" && confirmed };
}

/**
 * The gate decision is made twice, independently, from the same pages. If the
 * two give the same difficulty, the first stands. If they don't, the less
 * certain one is shown, never one picked at random: a decision the checker
 * didn't fully confirm before one it did, else the stricter gate. Either way
 * it's marked not fully confirmed.
 */
export function reconcileGates(first: GateDecision, second: GateDecision | null): { decision: GateDecision; disagreed: boolean } {
  if (!second || GATE_DIFFICULTY[first.gate] === GATE_DIFFICULTY[second.gate]) return { decision: first, disagreed: false };
  const lessCertain =
    first.gate === "unknown" || second.gate === "unknown"
      ? first.gate === "unknown"
        ? first
        : second
      : first.confirmed !== second.confirmed
        ? first.confirmed
          ? second
          : first
        : STRICTNESS.indexOf(second.gate) > STRICTNESS.indexOf(first.gate)
          ? second
          : first;
  return { decision: { ...lessCertain, confirmed: false }, disagreed: true };
}

/** The rating and reason when the two decisions disagreed: says so, and which way each went. */
export function disagreementRating(shown: GateDecision, first: GateDecision, second: GateDecision): { diff: Difficulty; reason: string; confirmed: boolean } {
  const diff = GATE_DIFFICULTY[shown.gate];
  const [a, b] = [capitalize(GATE_DIFFICULTY[first.gate]), capitalize(GATE_DIFFICULTY[second.gate])];
  return {
    diff,
    reason: `${capitalize(diff)}: two separate readings of the review rules disagreed (${a} and ${b}), so this shows the less certain one`,
    confirmed: false,
  };
}
