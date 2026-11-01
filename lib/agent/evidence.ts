import type { ApprovalResult, GuideDraft } from "@/lib/agent/schemas";
import { MIN_STEPS, isProviderLink, resolveOwner } from "@/lib/agent/rules";
import { pageWeight } from "@/lib/agent/sources";
import { stripProtocol, urlKey } from "@/lib/agent/urls";
import type { ChecklistItem, Difficulty, Guide, GuideBlocker, GuideStep } from "@/types/guide";
import { CHECKLIST, GENERATED_VERSION } from "@/types/guide";

export { hostOf, isUnder, stripProtocol, urlKey } from "@/lib/agent/urls";

/**
 * The evidence rules, enforced in code. The prompts ask the model to follow
 * them, but nothing here takes its word for it: provenance comes from the tool
 * results the API returned, not from what the model says it read.
 */

export interface FetchedPage {
  url: string;
  title: string;
  /** Page text. Empty until read, and for PDFs, which come back as base64. */
  text: string;
}

export const NOT_PUBLISHED = "Not published";
/** The wait when a timeline is published but too involved for a short label. */
export const SEE_TIMELINE = "See review timeline";

const GENERATED_TILE_COLOR = "#525252";
const MINUTES_PER_STEP = 5;
export const MAX_SOURCES = 6;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function initials(name: string): string {
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
    .replace(/[\u2013\u2014]/g, "-")
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
  ndash: "\u2013",
  mdash: "\u2014",
};

/** Below this, a page's <main> is probably a shell, so more of the page is used. */
const MIN_MAIN_CHARS = 400;

/**
 * A docs page's readable content: its <main> or <article>, without menus,
 * headers and footers. Docs sites open with long sidebar menus whose link text
 * would otherwise crowd out the page itself. Falls back to the whole page.
 */
export function pageContentText(html: string): string {
  const stripped = html.replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, " ");
  for (const tag of ["main", "article"]) {
    const inner = stripped.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*)</${tag}>`, "i"))?.[1];
    const text = inner ? htmlToText(inner).trim() : "";
    if (text.length >= MIN_MAIN_CHARS) return text;
  }
  const whole = htmlToText(stripped).trim();
  return whole.length >= MIN_MAIN_CHARS ? whole : htmlToText(html).trim();
}

/** Reduces a page to its readable text, for checking quotes and claims against it. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\s+/g, " ");
}

/** True only when the quote really is in the page, ignoring case and spacing. */
export function quoteAppearsIn(quote: string, text: string): boolean {
  const needle = flatten(quote);
  return needle.length > 0 && flatten(text).includes(needle);
}

const numbersIn = (text: string): Set<string> => new Set(text.match(/\d+/g) ?? []);

export interface TimelineVerdict {
  wait: string;
  item: ChecklistItem;
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Decides the published review timeline. It only exists if its quote is word for
 * word in a page read this run. The short label must carry exactly the numbers in
 * that quote, so "5 days, then 5-10 days" can't shrink to "5 days" or grow into
 * an invented "2 weeks". A label that fails still leaves the verified quote as the
 * checklist answer.
 */
export function resolveTimeline(approval: ApprovalResult, pages: Map<string, FetchedPage>): TimelineVerdict {
  const page = approval.evidenceUrl ? pages.get(urlKey(approval.evidenceUrl)) : undefined;
  const quote = approval.evidenceQuote?.trim();
  const notFound: TimelineVerdict = { wait: NOT_PUBLISHED, item: { key: "review_timeline", status: "not_found", answer: "" } };
  if (!page || !quote || !quoteAppearsIn(quote, page.text) || numbersIn(quote).size === 0) return notFound;

  const item: ChecklistItem = { key: "review_timeline", status: "found", answer: `“${escapeHtml(quote)}”`, source: page.url };
  const label = approval.timelineLabel?.trim() ?? "";
  const [inLabel, inQuote] = [numbersIn(label), numbersIn(quote)];
  const sameNumbers = inLabel.size === inQuote.size && [...inQuote].every((number) => inLabel.has(number));
  return { wait: label && sameNumbers && label.length <= 60 ? label : SEE_TIMELINE, item };
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

/**
 * Picks the links most likely to cover a topic. Topics match whole path words
 * (so "review" no longer matches a blog post about reviewing code), earlier
 * topics count for more, and only pages that pass `isAllowed` are considered.
 */
export function rankLinks(links: string[], topics: string[], isAllowed: (url: string) => boolean, limit: number): string[] {
  const scored = new Map<string, { url: string; score: number }>();

  for (const url of links) {
    if (!isAllowed(url)) continue;
    // A page's own slug says what it covers; parent folders only say where it sits.
    const segments = new URL(url).pathname.toLowerCase().split("/").filter(Boolean);
    const own = (segments.at(-1) ?? "").split(/[-_.]+/).filter(Boolean);
    const parents = segments.slice(0, -1).join("-").split(/[-_.]+/).filter(Boolean);
    const score = topics.reduce((total, topic, index) => {
      const weight = topics.length - index;
      if (own.some((word) => word.startsWith(topic))) return total + weight;
      return parents.some((word) => word.startsWith(topic)) ? total + weight / 3 : total;
    }, 0);
    if (score > 0) scored.set(urlKey(url), { url, score: score * pageWeight(url) });
  }

  return [...scored.values()]
    .sort((a, b) => b.score - a.score || a.url.length - b.url.length)
    .slice(0, limit)
    .map((entry) => entry.url);
}

/** Merges the stages' checklist answers into all ten items, in order. A found answer needs a page read this run. */
export function mergeChecklist(
  answers: { key: string; status: "found" | "not_found"; answer: string; sourceUrl: string | null }[],
  timeline: ChecklistItem,
  pages: Map<string, FetchedPage>,
): ChecklistItem[] {
  return CHECKLIST.map(({ key }) => {
    if (key === "review_timeline") return timeline;
    const answer = answers.find((entry) => entry.key === key && entry.status === "found" && entry.answer.trim());
    if (!answer) return { key, status: "not_found", answer: "" };
    const page = answer.sourceUrl ? pages.get(urlKey(answer.sourceUrl)) : undefined;
    return page
      ? { key, status: "found", answer: answer.answer.trim(), source: page.url }
      : // Claimed, but not from a page read this run: kept only as unconfirmed.
        { key, status: "uncertain", answer: answer.answer.trim() };
  });
}

interface BuildGuideInput {
  appName: string;
  draft: GuideDraft;
  checklist: ChecklistItem[];
  wait: string;
  review: string;
  diff: Difficulty;
  diffReason: string;
  /** Whether a blocker is needed because no timeline was published for a real review. */
  contactBlocker: GuideBlocker | null;
  developerConsoleUrl: string | null;
  officialDomains: string[];
  /** Pages fetched this run, by urlKey. */
  pages: Map<string, FetchedPage>;
  generatedAt: string;
}

/**
 * Turns a draft into a guide. Steps rest on checklist items: a step's source must
 * be the source of an item it's built from, so a step can't cite a page its
 * checklist answers didn't come from.
 */
export function buildGuide(input: BuildGuideInput): Guide {
  const { appName, draft, checklist, pages, officialDomains } = input;
  const sourceFor = (url: string | null) => (url ? pages.get(urlKey(url))?.url : undefined);
  const itemSource = (key: string) => checklist.find((item) => item.key === key && item.status === "found")?.source;

  const steps: GuideStep[] = draft.steps.map((step) => {
    const fromSources = step.from.map(itemSource).filter((url): url is string => Boolean(url));
    const proposed = sourceFor(step.sourceUrl);
    const source = proposed && fromSources.some((url) => urlKey(url) === urlKey(proposed)) ? proposed : fromSources[0];
    const link = step.link && isProviderLink(step.link.url, officialDomains) ? { label: step.link.label.trim(), url: step.link.url } : null;
    return {
      t: step.title.trim(),
      d: step.description.trim(),
      o: resolveOwner(step.owner, step.title, step.description),
      // No checklist-backed source means uncertain. Nothing generated is ever "verified".
      e: source ? "docs" : "uncertain",
      ...(source ? { source } : {}),
      ...(link ? { link } : {}),
    };
  });

  const blockers: GuideBlocker[] = draft.blockers.map((blocker) => {
    const source = sourceFor(blocker.sourceUrl);
    return { b: blocker.title.trim(), s: blocker.detail.trim(), ...(source ? { source } : {}) };
  });
  if (input.contactBlocker) blockers.push(input.contactBlocker);

  // This becomes a button, so a link planted in a web page must not reach it.
  const registerSource = itemSource("register_url");
  const consoleUrl =
    input.developerConsoleUrl && isProviderLink(input.developerConsoleUrl, officialDomains)
      ? input.developerConsoleUrl
      : (registerSource ?? [...pages.values()][0]?.url ?? `https://${officialDomains[0]}`);

  return {
    id: slugify(appName),
    name: appName,
    init: initials(appName),
    color: GENERATED_TILE_COLOR,
    diff: input.diff,
    diffReason: input.diffReason,
    tested: false,
    generated: true,
    generatedAt: input.generatedAt,
    version: GENERATED_VERSION,
    setup: setupEstimate(steps.length),
    wait: input.wait,
    review: input.review,
    site: stripProtocol(consoleUrl),
    steps,
    blockers,
    agent: draft.agentTasks.map((task) => task.trim()).filter(Boolean),
    you: draft.youTasks.map((task) => task.trim()).filter(Boolean),
    sources: [],
    otherPages: [],
    checklist,
    claimCheck: { checked: 0, kept: 0, downgraded: 0, dropped: 0 },
  };
}

/** A placeholder from the step count, shown as "Rough estimate". Nothing the model says about hands-on time could be sourced. */
export const setupEstimate = (stepCount: number) => `~${Math.max(stepCount, MIN_STEPS) * MINUTES_PER_STEP} min`;

/**
 * Sources are only the pages something cites, in the order first cited and
 * at most six. Every other page read goes to `otherPages`.
 */
export function splitSources(guide: Guide, pages: Map<string, FetchedPage>): Pick<Guide, "sources" | "otherPages"> {
  const cited = [
    ...guide.steps.map((step) => step.source),
    ...(guide.checklist ?? []).map((item) => item.source),
    ...guide.blockers.map((blocker) => blocker.source),
  ].filter((url): url is string => Boolean(url));

  const seen = new Set<string>();
  const ordered = cited.filter((url) => !seen.has(urlKey(url)) && seen.add(urlKey(url)));
  const entry = (url: string): [string, string] => {
    const title = pages.get(urlKey(url))?.title?.trim();
    return [title || stripProtocol(url), stripProtocol(url)];
  };
  const others = [...pages.values()].map((page) => page.url).filter((url) => !seen.has(urlKey(url)));

  return {
    sources: ordered.slice(0, MAX_SOURCES).map(entry),
    otherPages: [...ordered.slice(MAX_SOURCES), ...others].map(entry),
  };
}
