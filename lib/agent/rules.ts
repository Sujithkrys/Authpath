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
  share join apply request verify list describe enrol enroll email notify`.split(/\s+/),
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
 * What stands between a working app and real users, as the approval stage
 * found it. The model reports one of these with a quote; code decides the rating.
 */
export const GATES = [
  "none",
  "listing_only",
  "light_verification",
  "mandatory_review",
  "security_assessment",
  "partner_program",
  "paid_plan",
  "unknown",
] as const;
export type Gate = (typeof GATES)[number];

const GATE_DIFFICULTY: Record<Gate, Difficulty> = {
  none: "easy",
  listing_only: "moderate",
  light_verification: "moderate",
  mandatory_review: "hard",
  security_assessment: "hard",
  partner_program: "hard",
  paid_plan: "hard",
  unknown: "unknown",
};

/** What each gate means, in words a checker can hold a page against. */
export const GATE_MEANING: Record<Gate, string> = {
  none: "self-serve, with no review needed to go live",
  listing_only: "review is only needed for a public listing",
  light_verification: "light business verification is needed",
  mandatory_review: "a mandatory review is needed before real users can connect",
  security_assessment: "a security assessment is needed before real users can connect",
  partner_program: "a partner program is needed before real users can connect",
  paid_plan: "a paid plan is needed before real users can connect",
  unknown: "the approval process couldn't be confirmed in the official docs",
};

/**
 * What the checker holds the gate's quoted page against: only what such a quote
 * can show. "Only for a listing" is the rule's reading once no stricter gate was
 * found, so the claim checked is that the listing review exists.
 */
export const GATE_CLAIM: Record<Gate, string> = {
  none: "developers can create and register an app themselves from their own account",
  listing_only: "apps are reviewed before they can be listed in a public directory or marketplace",
  light_verification: "a business or brand verification is needed before real users can connect",
  mandatory_review: "a review is required before real users can connect",
  security_assessment: "a security assessment is required before real users can connect",
  partner_program: "joining a partner program is required before real users can connect",
  paid_plan: "a paid plan is required before real users can connect",
  unknown: "the approval process is not documented",
};

/** Short "Review needed" label for each gate. */
export const GATE_REVIEW_LABEL: Record<Gate, string> = {
  none: "No",
  listing_only: "Listing only",
  light_verification: "Light verification",
  mandatory_review: "Required",
  security_assessment: "Security assessment",
  partner_program: "Partner program",
  paid_plan: "Paid plan",
  unknown: "Unclear",
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Gates that make an app harder than "listing only". Only ever taken from a confirmed claim. */
const STRICT_GATES = new Set<Gate>(["light_verification", "mandatory_review", "security_assessment", "partner_program", "paid_plan"]);

/** A review answer about getting listed rather than getting access. */
const LISTING_TERMS = /\b(marketplace|app store|app directory|directory|listing|listed|publish(ed|ing)? (to|in|on) )/i;

export interface GateEvidence {
  /** The gate the approval stage proposed. */
  proposed: Gate;
  /** Whether the checker confirmed the proposed gate against its page. */
  proposedConfirmed: boolean;
  proposedDetail: string;
  /** The review and registration checklist answers, after the checker. */
  review?: { status: string; answer: string };
  registration?: { status: string };
  /** Whether the research proposed any review answer at all, before the checker. */
  reviewProposed: boolean;
}

/**
 * Decides the gate from checked evidence rather than the model's pick, which
 * varies run to run:
 * - a strict gate stands only if the checker confirmed it;
 * - if the research found any review at all, a confirmed answer about a
 *   marketplace or directory listing means listing only, and anything else is
 *   unknown. A review the checker couldn't confirm never turns into "none";
 * - an unconfirmed strict gate is unknown;
 * - only with no review found at all does confirmed self-serve registration mean none.
 */
export function decideGate(evidence: GateEvidence): { gate: Gate; detail: string } {
  const { proposed, proposedConfirmed, proposedDetail, review, registration, reviewProposed } = evidence;
  if (STRICT_GATES.has(proposed) && proposedConfirmed) return { gate: proposed, detail: proposedDetail };
  if (reviewProposed) {
    return review?.status === "found" && LISTING_TERMS.test(review.answer)
      ? { gate: "listing_only", detail: "review is only needed to be listed in its marketplace or app directory" }
      : { gate: "unknown", detail: "" };
  }
  if (STRICT_GATES.has(proposed)) return { gate: "unknown", detail: "" };
  if (registration?.status === "found") {
    return { gate: "none", detail: "you register the app yourself, and the review pages read describe no review before real users connect" };
  }
  return { gate: "unknown", detail: "" };
}

/**
 * The rating comes from the gate alone, and only from a confirmed one: the gate's
 * quote must be on a page read this run and the checker must agree. Otherwise
 * it's "unknown", never a guess.
 */
export function difficultyFor(gate: Gate, confirmed: boolean, detail: string): { diff: Difficulty; reason: string } {
  const effective: Gate = confirmed ? gate : "unknown";
  const diff = GATE_DIFFICULTY[effective];
  const specific = detail.trim().replace(/\.$/, "");
  const reason =
    effective !== "unknown" && specific && specific.length <= 110 ? specific : GATE_MEANING[effective];
  return { diff, reason: `${capitalize(diff)}: ${reason}` };
}
