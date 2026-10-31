import type { ApprovalResult, GuideDraft } from "@/lib/agent/schemas";
import type { Guide, GuideBlocker, GuideStep } from "@/types/guide";

/**
 * The evidence rules, enforced in code. The prompts ask the model to follow
 * them, but nothing here takes its word for it: provenance comes from the tool
 * results the API returned, not from what the model says it read.
 */

export interface FetchedPage {
  url: string;
  title: string;
  /** Page text. Empty for PDFs, which come back as base64. */
  text: string;
}

export const NOT_PUBLISHED = "Not published";

/** Forces "you" whatever the model chose. Wrongly handing a step to the developer is the safe mistake. */
const NEEDS_THE_DEVELOPER =
  /\b(sign(ing)? (in|up)|log(ging)? ?in|submit|submitting|verify|verification|wait(ing)?|legal|contract|agreement|terms of service|business|approv(e|al)|payment|billing|contact|security (review|assessment))\b/i;

const GENERATED_TILE_COLOR = "#525252";
const MINUTES_PER_STEP = 5;

export function urlKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.toLowerCase().replace(/^www\./, "")}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export const isUnder = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

export function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  return letters.toUpperCase().replace(/[^A-Z0-9]/g, "") || "?";
}

/** Smart quotes and long dashes differ between a page and a model's copy of it, without changing the words. */
const flatten = (text: string) =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
};

/** Reduces a page to its readable text, for checking quotes against it. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (match, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? match);
}

/** True only when the quote really is in the page, ignoring case and spacing. */
export function quoteAppearsIn(quote: string, text: string): boolean {
  const needle = flatten(quote);
  return needle.length > 0 && flatten(text).includes(needle);
}

const numbersIn = (text: string): string[] => text.match(/\d+/g) ?? [];

export interface ApprovalVerdict {
  wait: string;
  /** Set when no timeline could be verified, so the guide needs the contact blocker. */
  missingTimeline: boolean;
  sourceUrl: string | null;
}

/**
 * Decides the approval wait. A time only survives if its quote is word for word
 * in a page fetched this run and every number in the label is in that quote, so
 * the model can't turn "a few weeks" into "2 weeks" or invent one outright.
 */
export function resolveApproval(approval: ApprovalResult, pages: Map<string, FetchedPage>): ApprovalVerdict {
  const page = approval.evidenceUrl ? pages.get(urlKey(approval.evidenceUrl)) : undefined;
  const quote = approval.evidenceQuote;
  const quoteHolds = Boolean(page && quote && quoteAppearsIn(quote, page.text));

  if (quoteHolds && approval.reviewRequired === "no") {
    return { wait: "None", missingTimeline: false, sourceUrl: page!.url };
  }

  const label = approval.timelineLabel?.trim();
  if (quoteHolds && label && numbersIn(label).every((number) => numbersIn(quote!).includes(number))) {
    return { wait: label, missingTimeline: false, sourceUrl: page!.url };
  }

  return { wait: NOT_PUBLISHED, missingTimeline: true, sourceUrl: page?.url ?? null };
}

/** Absolute page links in a page's HTML, or in a sitemap's <loc> entries. */
export function linksIn(markup: string, baseUrl: string): string[] {
  const found = [...markup.matchAll(/href=["']([^"'#]+)|<loc>\s*([^<\s]+)/gi)].map((match) => match[1] ?? match[2]);
  return found.flatMap((link) => {
    try {
      return [new URL(link, baseUrl).toString().split("#")[0]];
    } catch {
      return [];
    }
  });
}

const NOT_DOCS = /\.(png|jpe?g|svg|gif|webp|css|js|ico|woff2?|xml|zip)$|\/(blog|changelog|customers|pricing|careers|press|legal|privacy|terms|login|signup)(\/|$)/i;

/**
 * Picks the links most likely to cover a topic. Earlier topic words count for
 * more, and only https pages on the official domains are considered.
 */
export function rankLinks(links: string[], topics: string[], domains: string[], limit: number): string[] {
  const scored = new Map<string, { url: string; score: number }>();

  for (const url of links) {
    const host = hostOf(url);
    if (!url.startsWith("https://") || !host || !domains.some((domain) => isUnder(host, domain))) continue;

    const path = new URL(url).pathname.toLowerCase();
    if (NOT_DOCS.test(path)) continue;

    const score = topics.reduce((total, topic, index) => total + (path.includes(topic) ? topics.length - index : 0), 0);
    if (score > 0) scored.set(urlKey(url), { url, score });
  }

  return [...scored.values()]
    .sort((a, b) => b.score - a.score || a.url.length - b.url.length)
    .slice(0, limit)
    .map((entry) => entry.url);
}

interface BuildGuideInput {
  appName: string;
  draft: GuideDraft;
  approval: ApprovalResult;
  developerConsoleUrl: string | null;
  officialDomains: string[];
  /** Pages fetched this run, by urlKey. */
  pages: Map<string, FetchedPage>;
  generatedAt: string;
}

export function buildGuide({
  appName,
  draft,
  approval,
  developerConsoleUrl,
  officialDomains,
  pages,
  generatedAt,
}: BuildGuideInput): Guide {
  const fetched = [...pages.values()];
  const sourceFor = (url: string | null) => (url ? pages.get(urlKey(url))?.url : undefined);

  const steps: GuideStep[] = draft.steps.map((step) => {
    const source = sourceFor(step.sourceUrl);
    return {
      t: step.title,
      d: step.description,
      o: step.owner === "agent" && !NEEDS_THE_DEVELOPER.test(`${step.title} ${step.description}`) ? "agent" : "you",
      // No fetched source means uncertain. Nothing generated can ever be "verified".
      e: source && step.evidence === "docs" ? "docs" : "uncertain",
      ...(source ? { source } : {}),
    };
  });

  const blockers: GuideBlocker[] = draft.blockers.map((blocker) => {
    const source = sourceFor(blocker.sourceUrl);
    return { b: blocker.title, s: blocker.detail, ...(source ? { source } : {}) };
  });

  const verdict = resolveApproval(approval, pages);
  if (verdict.missingTimeline) {
    blockers.push({
      b: "Approval timeline not published",
      s: `The docs we read don't give an approval timeline. Contact ${appName} before you plan a launch date.`,
      source: verdict.sourceUrl ?? fetched.at(-1)?.url,
    });
  }

  // This becomes a button, so a link planted in a web page must not reach it.
  const consoleHost = developerConsoleUrl?.startsWith("https://") ? hostOf(developerConsoleUrl) : null;
  const consoleIsOfficial = consoleHost && officialDomains.some((domain) => isUnder(consoleHost, domain));
  const consoleUrl = consoleIsOfficial ? developerConsoleUrl! : fetched[0].url;

  return {
    id: slugify(appName),
    name: appName,
    init: initials(appName),
    color: GENERATED_TILE_COLOR,
    diff: draft.difficulty,
    tested: false,
    generated: true,
    generatedAt,
    // A placeholder from the step count, shown as "Rough estimate". Nothing the
    // model says about hands-on time could be sourced.
    setup: `~${steps.length * MINUTES_PER_STEP} min`,
    wait: verdict.wait,
    review: approval.reviewRequired === "unknown" ? "Unclear" : approval.reviewLabel.trim() || "Unclear",
    site: stripProtocol(consoleUrl),
    steps,
    blockers,
    agent: draft.agentTasks,
    you: draft.youTasks,
    sources: fetched.map((page) => [page.title || stripProtocol(page.url), stripProtocol(page.url)]),
  };
}
