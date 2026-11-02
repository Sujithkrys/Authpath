/** "unknown" is only for generated guides whose approval process couldn't be confirmed. */
export type Difficulty = "easy" | "moderate" | "hard" | "unknown";
export type WaitKey = "none" | "days" | "weeks";
export type StepOwner = "you" | "agent";
export type Evidence = "verified" | "docs" | "uncertain";

/** A labelled link shown with a step, so step text never holds a raw URL. */
export interface StepLink {
  /** e.g. "Open the Slack app console". */
  label: string;
  /** https URL on the provider's official domains. */
  url: string;
}

export interface GuideStep {
  /** Title. */
  t: string;
  /** Description. May contain inline <code> tags, and no other markup. Never a raw URL. */
  d: string;
  /** Who does the step. */
  o: StepOwner;
  /** How we know the step is right. "verified" is only ever set by hand, on library guides. */
  e: Evidence;
  /** The page this step rests on. Generated guides only. */
  source?: string;
  /** Where to do the step. Generated guides only. */
  link?: StepLink;
}

export interface GuideBlocker {
  /** Title. */
  b: string;
  /** Explanation. */
  s: string;
  /** The page this blocker rests on. Generated guides only. */
  source?: string;
}

/** [title, url without protocol] */
export type GuideSource = [title: string, url: string];

/** The fixed research checklist for OAuth providers, in display order. */
export const CHECKLIST = [
  { key: "register_url", label: "Where to register the app" },
  { key: "app_types", label: "App types" },
  { key: "required_fields", label: "Required registration fields" },
  { key: "redirect_uris", label: "Redirect URI rules" },
  { key: "credentials", label: "Credentials" },
  { key: "scopes", label: "Scopes" },
  { key: "review", label: "Review or verification" },
  { key: "review_timeline", label: "Published review timeline" },
  { key: "test_limits", label: "Development or test-mode limits" },
  { key: "rejection_reasons", label: "Common rejection reasons" },
] as const;

export type ChecklistKey = (typeof CHECKLIST)[number]["key"];

export interface ChecklistItem {
  key: ChecklistKey;
  /**
   * found: the cited page directly supports the answer.
   * uncertain: the cited page only partly supports it.
   * not_found: the right official pages were read and don't say.
   * unreadable: the pages that would say couldn't be read by any method.
   */
  status: "found" | "uncertain" | "not_found" | "unreadable";
  /** One or two short sentences. May contain inline <code>. Empty when not_found. */
  answer: string;
  /** The page the answer rests on. Absent when not_found. */
  source?: string;
}

/** What the separate checking pass did to the guide's claims. */
export interface ClaimCheck {
  /** Steps and checklist answers sent to the checker. */
  checked: number;
  /** Supported directly: kept as docs/found. */
  kept: number;
  /** Partly supported: marked uncertain. */
  downgraded: number;
  /** Not supported: removed. */
  dropped: number;
}

/** Bumped when generated results change shape or how they're researched. Older ones aren't served from the cache. */
export const GENERATED_VERSION = 6;

export interface Guide {
  /** Also the URL slug: /guides/[id]. */
  id: string;
  name: string;
  /** Letters for the fallback tile. */
  init: string;
  /** Background of the letter tile. */
  color: string;
  diff: Difficulty;
  /** One line saying why, e.g. "Hard: Gmail scopes require a security assessment". Generated guides only. */
  diffReason?: string;
  /** False when the rating is a best estimate: its quote is real, but the checker only partly agreed. */
  diffConfirmed?: boolean;
  tested: boolean;
  /** True for the agent's output. These stay out of the library. */
  generated?: boolean;
  /** ISO timestamp. Generated guides only. */
  generatedAt?: string;
  /** GENERATED_VERSION when it was made. Generated guides only. */
  version?: number;
  setup: string;
  wait: string;
  review: string;
  /** Approval-wait filter bucket. Generated guides don't have one. */
  waitKey?: WaitKey;
  /** Developer console, without protocol. */
  site: string;
  steps: GuideStep[];
  blockers: GuideBlocker[];
  agent: string[];
  you: string[];
  /** Pages a step, blocker or checklist answer cites. Deduplicated, at most 6 on generated guides. */
  sources: GuideSource[];
  /** Pages read but not cited. Generated guides only, shown collapsed. */
  otherPages?: GuideSource[];
  /** All ten checklist items, in CHECKLIST order. Generated guides only. */
  checklist?: ChecklistItem[];
  /** Generated guides only. */
  claimCheck?: ClaimCheck;
  /** Core steps the docs read didn't give: creating the app, getting its credentials. Generated guides only. */
  incomplete?: CoreStep[];
  /** How each page was read, by address without protocol. Guides made by the new rules only. */
  readMethods?: Record<string, ReadMethod>;
  /** Endpoints and scopes from the provider's OpenID discovery file, when it has one. */
  openid?: OpenIdDiscovery;
  /** What the gap-filling round did: items it looked for and items it answered. */
  gapFill?: { searched: ChecklistKey[]; filled: ChecklistKey[] };
  /** The gate each of the two independent decisions reached, when they disagreed. */
  gateRuns?: [string, string];
  /** Pages chosen for reading that couldn't be read, without protocol. Generated guides only. */
  unreadPages?: string[];
}

/**
 * How a page's text was obtained: a plain fetch, Gemini URL context, a markdown
 * copy (.md or a linked alternate), the site's llms.txt files, another page
 * found in the sitemap, or the OpenID discovery file.
 */
export type ReadMethod = "fetch" | "url_context" | "markdown" | "llms_txt" | "sitemap" | "openid_discovery";

export interface OpenIdDiscovery {
  url: string;
  authorizationEndpoint: string;
  tokenEndpoint?: string;
  scopes: string[];
}

/** The steps every OAuth setup needs. A guide missing one is marked incomplete. */
export type CoreStep = "create_app" | "credentials";

/**
 * What kind of app it is.
 * oauth_provider: third-party developers can register OAuth apps with it.
 * no_oauth: API keys only, or no public API.
 * platform: connects to other apps for you (Composio, Zapier, Nango).
 * unknown: ambiguous, or the docs read don't settle it.
 */
export type AppCategory = "oauth_provider" | "no_oauth" | "platform" | "unknown";

/** The short, honest result for anything that isn't an OAuth provider. Saved and shared like a guide. */
export interface AppCard {
  kind: "card";
  /** Also the URL slug: /guides/[id]. */
  id: string;
  name: string;
  category: Exclude<AppCategory, "oauth_provider">;
  /** What the app is. One or two sentences. */
  summary: string;
  /** The auth it offers, e.g. "Account API tokens". May be empty when nothing is documented. */
  authMethods: string[];
  /** What to do instead. One or two sentences. */
  instead: string;
  /** Official pages backing the card. At least one. */
  sources: GuideSource[];
  generatedAt: string;
  version: number;
}

export type GeneratedResult = Guide | AppCard;

export const isAppCard = (result: GeneratedResult): result is AppCard => "kind" in result && result.kind === "card";

/** A guide plus its logo file, or null when it uses the letter tile. */
export interface GuideWithLogo extends Guide {
  logoSrc: string | null;
}
