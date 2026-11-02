import { ApiError, GoogleGenAI, UrlRetrievalStatus, type GenerateContentConfig, type GenerateContentResponse } from "@google/genai";
import { z } from "zod";

import { htmlToText, linksIn, pageContentText, rankLinks } from "@/lib/agent/evidence";
import { llmsFiles, looksLikeHtml, markdownAlternates, markdownTitle, markdownToText } from "@/lib/agent/plain-text";
import { isDiscoverable, isEndpointReferencePage, isLocaleVariant } from "@/lib/agent/sources";
import { hostOf, isUnder, urlKey } from "@/lib/agent/urls";
import { excerpt } from "@/lib/agent/verify";
import type { PageRead, RunLedger } from "@/lib/llm/ledger";
import {
  AgentError,
  type FindPagesRequest,
  type FindPagesResult,
  QuotaExhausted,
  type LlmProvider,
  type ResearchRequest,
  type WriteRequest,
} from "@/lib/llm/types";

/**
 * Google Search isn't available on the free tier for Gemini 3 and newer, and
 * the 2.5 models that have it are closed to accounts that haven't used them, so
 * by default this runs on URL context alone. GEMINI_SEARCH=true turns Search on
 * for a key that can use it.
 * https://ai.google.dev/gemini-api/docs/pricing
 */
const MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.6-flash"];
const searchEnabled = () => process.env.GEMINI_SEARCH === "true";

const NO_SEARCH_NOTE = `Web search isn't available in this run. Work from what you know about this provider, and name the official pages you're confident exist. Those URLs get checked by loading them, so a guess that doesn't load is simply discarded. If you don't recognise the app, say not_found.`;

const CandidatePages = z.object({
  urls: z.array(z.string()).describe("Up to 5 official URLs most likely to cover this, deep pages rather than home pages."),
});

const MAX_OUTPUT_TOKENS = 16_000;
// Real calls here answer in about 3-15 seconds; a stall shouldn't cost a minute of the run.
const CALL_TIMEOUT_MS = 35_000;
const HIGH_DEMAND_WAIT_MS = 2_000;
const PAGE_FETCH_TIMEOUT_MS = 10_000;
const MAX_PAGE_BYTES = 3_000_000;
const REDIRECT_TIMEOUT_MS = 5_000;

const QUOTA_BUSY = "The free AI quota is busy, try again in a minute.";
const QUOTA_USED_UP = "The free AI quota for today has run out. It resets at midnight Pacific time.";

/**
 * Google applies limits per project and varies them by model
 * (https://ai.google.dev/gemini-api/docs/rate-limits), and its daily quota is
 * "PerDayPerProjectPerModel", so the next model still has quota when one is out.
 * An explicit GEMINI_MODEL is used alone.
 */
const models = () => (process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : MODELS);

/**
 * GEMINI_API_KEY serves the live site. GEMINI_API_KEY_DEV, if set, serves local
 * work and compare mode, so testing can't use up the demo's quota. It only helps
 * if it belongs to a different Google Cloud project, because limits are per
 * project, not per key. Production never reads it.
 */
export function geminiApiKey(): string | undefined {
  const live = process.env.GEMINI_API_KEY;
  return process.env.NODE_ENV === "production" ? live : process.env.GEMINI_API_KEY_DEV || live;
}

function client() {
  return new GoogleGenAI({ apiKey: geminiApiKey() });
}

/** Busy, out of quota, or not open to this key: all reasons another model might still work. */
const worthTryingAnother = (error: unknown) =>
  error instanceof ApiError && (error.status === 429 || error.status === 503 || error.status === 404);

/** Puts the SDK's errors into words a person can act on. The technical reason stays in `detail`. */
function plainError(error: unknown): unknown {
  if (!(error instanceof ApiError)) return error;

  console.error("gemini error", error.status, error.message);
  const reason = error.message.match(/"message":\s*"([^"]+)"/)?.[1] ?? error.message;
  const detail = `${error.status}: ${reason.slice(0, 300)}`;

  if (error.status === 429) {
    return /per.?day|daily/i.test(error.message)
      ? new AgentError(QUOTA_USED_UP, false, detail)
      : new AgentError(QUOTA_BUSY, true, detail);
  }
  if (error.status === 503) return new AgentError(QUOTA_BUSY, true, detail);
  if (error.status === 401 || error.status === 403) {
    return new AgentError("The generator isn't set up correctly.", false, detail);
  }
  if (/api.?key/i.test(reason)) return new AgentError("The Gemini API key isn't valid.", false, detail);
  if (error.status === 404) return new AgentError("This Gemini key can't use the configured model.", false, detail);
  return new AgentError("Something went wrong while researching this app.", true, detail);
}

const MAX_RETRY_WAIT_MS = 60_000;

const isDailyLimit = (error: unknown) => error instanceof ApiError && error.status === 429 && /per.?day|daily/i.test(error.message);

/** A model this key can't use today: its daily quota is gone, it has none, or it isn't open to the key. */
const isOutForToday = (error: unknown) =>
  error instanceof ApiError && (isDailyLimit(error) || error.status === 404 || (error.status === 429 && /limit:\s*0\b/.test(error.message)));

/** The wait a per-minute 429 asks for, if it's short. Per-day limits never qualify. */
function shortRetryDelay(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.status !== 429 || isDailyLimit(error)) return null;
  // "limit: 0" means this model has no free quota at all, so waiting won't help.
  if (/limit:\s*0\b/.test(error.message)) return null;
  const seconds = Number(error.message.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/)?.[1] ?? 10);
  const ms = Math.ceil(seconds * 1000) + 500;
  return ms <= MAX_RETRY_WAIT_MS ? ms : null;
}

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });

async function generate(
  contents: string,
  config: GenerateContentConfig,
  ledger: RunLedger,
  signal: AbortSignal,
): Promise<GenerateContentResponse> {
  const failures: string[] = [];
  let lastError: unknown;

  // Each pass tries every model in turn, since each has its own quota. If they
  // were all briefly busy, one more pass follows after the wait they asked for.
  for (let pass = 0; pass < 2; pass++) {
    let wait: number | null = null;
    let anyDaily = false;
    let allOut = true;

    for (const model of models()) {
      try {
        const response = await client().models.generateContent({
          model,
          contents,
          config: {
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            // A stalled model shouldn't use up the whole run.
            abortSignal: AbortSignal.any([signal, AbortSignal.timeout(CALL_TIMEOUT_MS)]),
            ...config,
          },
        });

        const usage = response.usageMetadata;
        ledger.addUsage({
          modelCalls: 1,
          input: (usage?.promptTokenCount ?? 0) + (usage?.toolUsePromptTokenCount ?? 0),
          output: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
          cacheRead: usage?.cachedContentTokenCount ?? 0,
        });
        return response;
      } catch (error) {
        if (signal.aborted) throw error;

        const stalled = !(error instanceof ApiError) && error instanceof Error && /abort|timeout/i.test(`${error.name} ${error.message}`);
        failures.push(`${model}: ${stalled ? `no reply in ${CALL_TIMEOUT_MS / 1000}s` : String(error).slice(0, 220)}`);
        console.warn("gemini call failed", failures.at(-1));
        lastError = error;

        if (!stalled && !worthTryingAnother(error)) throw toPlainError(error, failures);

        anyDaily ||= isDailyLimit(error);
        allOut &&= isOutForToday(error);
        const delay = shortRetryDelay(error) ?? (error instanceof ApiError && error.status === 503 ? HIGH_DEMAND_WAIT_MS : null);
        if (delay !== null) wait = Math.min(wait ?? delay, delay);
      }
    }

    if (allOut && anyDaily) throw new QuotaExhausted(QUOTA_USED_UP, failures.join(" | "));
    if (wait === null || pass === 1) break;
    await pause(wait, signal);
  }

  throw toPlainError(lastError, failures);
}

function toPlainError(error: unknown, failures: string[]): unknown {
  const detail = failures.join(" | ");
  if (!(error instanceof ApiError)) return new AgentError(QUOTA_BUSY, true, detail);
  const plain = plainError(error);
  return plain instanceof AgentError ? new AgentError(plain.message, plain.retryable, detail) : plain;
}

/**
 * Grounding links are Google redirects. Follows one hop to the real page, which
 * is what the evidence rules need, falling back to the domain Gemini gives as
 * the chunk's title.
 */
async function realUrl(uri: string, title: string | undefined): Promise<string | null> {
  if (!uri.includes("grounding-api-redirect")) return uri;

  try {
    const response = await fetch(uri, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(REDIRECT_TIMEOUT_MS),
    });
    const location = response.headers.get("location");
    if (location) return location;
  } catch {
    // Fall through to the title.
  }
  return title && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(title) ? `https://${title}` : null;
}

async function recordSearch(response: GenerateContentResponse, ledger: RunLedger): Promise<string[]> {
  const metadata = response.candidates?.[0]?.groundingMetadata;
  ledger.addUsage({ searches: metadata?.webSearchQueries?.length ?? 0 });

  const chunks = metadata?.groundingChunks?.flatMap((chunk) => (chunk.web?.uri ? [chunk.web] : [])) ?? [];
  const urls = await Promise.all(chunks.map((web) => realUrl(web.uri!, web.title)));
  return urls.filter((url): url is string => Boolean(url));
}

/** The pages URL context really retrieved, whatever the model says it read. */
function retrievedUrls(response: GenerateContentResponse, ledger: RunLedger): string[] {
  const entries = response.candidates?.[0]?.urlContextMetadata?.urlMetadata ?? [];
  ledger.addUsage({ fetches: entries.length });

  return entries.flatMap((entry) =>
    entry.retrievedUrl && entry.urlRetrievalStatus === UrlRetrievalStatus.URL_RETRIEVAL_STATUS_SUCCESS
      ? [entry.retrievedUrl]
      : [],
  );
}

const present = (domains: (string | null)[]) => [...new Set(domains.filter((domain): domain is string => Boolean(domain)))];

/** Gemini's schema format has no anyOf, so nullable fields become type arrays. */
function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (typeof node !== "object" || node === null) return node;

  const { $schema: _dropped, anyOf, ...rest } = node as Record<string, unknown>;
  const converted = Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, toGeminiSchema(value)]));

  if (Array.isArray(anyOf)) {
    const options = anyOf as Record<string, unknown>[];
    const real = options.find((option) => option.type !== "null");
    return { ...(toGeminiSchema(real) as object), type: [real?.type, "null"], ...converted };
  }
  return converted;
}

const jsonSchemaFor = (schema: z.ZodType) => toGeminiSchema(z.toJSONSchema(schema));

/** Finds the JSON object in a reply that may have prose or code fences around it. */
function parseJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new SyntaxError("No JSON object in reply");
  return JSON.parse(text.slice(start, end + 1));
}

async function structured<T extends z.ZodType>({ system, user, schema, ledger, signal }: WriteRequest<T>): Promise<z.infer<T>> {
  const response = await generate(
    user,
    { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: jsonSchemaFor(schema) },
    ledger,
    signal,
  );

  if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") {
    throw new AgentError("The model ran out of room before finishing this step.");
  }
  // A malformed reply is reported as a schema failure, so the write stage's retry applies.
  try {
    return schema.parse(parseJson(response.text ?? ""));
  } catch (error) {
    if (error instanceof z.ZodError) throw error;
    throw new z.ZodError([{ code: "custom", path: [], message: "The reply wasn't valid JSON", input: response.text }]);
  }
}

/** Tools can't be combined with a response schema on 2.5 models, so the shape is asked for in the prompt. */
function askForJson(schema: z.ZodType): string {
  return `\n\nReply with only one JSON object matching this JSON Schema, with no other text:\n${JSON.stringify(jsonSchemaFor(schema))}`;
}

function siteHint(domains: string[] | undefined): string {
  if (!domains?.length) return "";
  return `\n\nOnly use the provider's own sites. Put ${domains.map((domain) => `site:${domain}`).join(" OR ")} in your search queries.`;
}

/**
 * Research with no web search. The model names the pages from what it knows,
 * then URL context loads them, so a page only counts if it really came back.
 */
async function researchWithoutSearch<T extends z.ZodType>(request: ResearchRequest<T>): Promise<z.infer<T>> {
  const { system, user, schema, read, candidates, ledger, onDomains, signal } = request;

  if (read && read.propose === false) return readPages(request, "");

  if (read) {
    const { urls } = await structured({
      system: `${system}\n\n${NO_SEARCH_NOTE}`,
      user: `${user}\n\nName the pages to read. Official sites: ${read.allowedDomains.join(", ")}`,
      schema: CandidatePages,
      ledger,
      signal,
    });
    const official = urls.filter((url) => {
      const host = hostOf(url);
      return host !== null && read.allowedDomains.some((domain) => isUnder(host, domain)) && ledger.accepts(url);
    });
    return readPages({ ...request, read: { ...read, urls: [...new Set([...official, ...read.urls])] } }, "");
  }

  const result = await structured({ system: `${system}\n\n${NO_SEARCH_NOTE}`, user, schema, ledger, signal });
  const pages = candidates?.(result) ?? [];

  if (pages.length > 0) {
    const response = await generate(
      `Read these pages, then say in one line what each one is:\n${pages.join("\n")}`,
      { tools: [{ urlContext: {} }] },
      ledger,
      signal,
    );
    const domains = retrievedUrls(response, ledger).map((url) => ledger.addSearched(url));
    if (domains.length > 0) onDomains?.(present(domains));
  }
  return result;
}

/** Reads a public page ourselves, for its links or its text. Returns "" if it can't be read. */
async function download(url: string, signal: AbortSignal): Promise<{ text: string; finalUrl: string }> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Authpath docs checker)", "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS)]),
    });
    if (!response.ok) return { text: "", finalUrl: url };
    const bytes = new Uint8Array(await response.arrayBuffer()).slice(0, MAX_PAGE_BYTES);
    return { text: new TextDecoder().decode(bytes), finalUrl: response.url || url };
  } catch {
    return { text: "", finalUrl: url };
  }
}

/** Below this many readable pages, URL context reads instead. */
const MIN_PAGES_WITH_TEXT = 2;
/** Text shorter than this is a shell page that needs JavaScript, not docs. */
const MIN_PAGE_CHARS = 400;
/** A plain fetch with less text than this is worth another way of reading. */
const MIN_USEFUL_CHARS = 800;
/** llms-full.txt shorter than this isn't a copy of the docs. */
const MIN_FULL_COPY_CHARS = 2_000;
/** How many of the best-ranked pages get the larger text allowance, and the other ways of reading. */
const MAIN_PAGES = 3;
const MAIN_PAGE_CHARS = 12_000;

const titleOf = (html: string) => htmlToText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim().slice(0, 140);

/** Downloads a page once per run. Its text is kept whatever its length; each caller decides what's enough. */
export function readPage(url: string, ledger: RunLedger, signal: AbortSignal): Promise<PageRead> {
  const key = urlKey(url);
  const cached = ledger.reads.get(key);
  if (cached) return cached;

  const attempt = (async (): Promise<PageRead> => {
    const { text: html, finalUrl } = await download(url, signal);
    return { url: finalUrl, title: html ? titleOf(html) : "", text: html ? pageContentText(html) : "", markup: html, via: html ? "fetch" : null };
  })();
  ledger.reads.set(key, attempt);
  return attempt;
}

/** Downloads a plain-text file. A site that answers every path with its HTML app shell doesn't count. */
async function downloadPlainText(url: string, signal: AbortSignal): Promise<string> {
  const { text } = await download(url, signal);
  return text && !looksLikeHtml(text) ? text : "";
}

/** The links in a docs host's sitemap.xml and llms.txt, fetched once per run. */
function siteIndex(host: string, ledger: RunLedger, signal: AbortSignal): Promise<{ sitemap: string[]; llms: string[] }> {
  const cached = ledger.siteIndexes.get(host);
  if (cached) return cached;
  const index = (async () => {
    const [sitemap, llms] = await Promise.all([download(`https://${host}/sitemap.xml`, signal), downloadPlainText(llmsFiles(host).index, signal)]);
    return { sitemap: linksIn(sitemap.text, sitemap.finalUrl), llms: linksIn(llms, `https://${host}/`) };
  })();
  ledger.siteIndexes.set(host, index);
  return index;
}

const Transcripts = z.object({
  pages: z.array(z.object({ url: z.string(), text: z.string() })).describe("One entry per page that loaded."),
});

const TRANSCRIBE_PROMPT = `Copy the main text of each page below, word for word, exactly as it appears on the page. Don't summarise, reword or add anything. Leave out menus, headers and footers. Keep at most 6,000 characters per page. Skip a page that doesn't load.`;

/**
 * Gemini URL context on pages a plain fetch couldn't read, all in one call. It
 * copies each page's text, and a copy only counts for a page URL context
 * reports it really retrieved.
 */
async function readWithUrlContext(urls: string[], ledger: RunLedger, signal: AbortSignal): Promise<Map<string, PageRead>> {
  const found = new Map<string, PageRead>();
  if (urls.length === 0 || !ledger.takeUrlContextRescue()) return found;
  try {
    const response = await generate(`${TRANSCRIBE_PROMPT}\n\n${urls.join("\n")}${askForJson(Transcripts)}`, { tools: [{ urlContext: {} }] }, ledger, signal);
    const retrieved = new Set(retrievedUrls(response, ledger).map(urlKey));
    let parsed: z.infer<typeof Transcripts> | null = null;
    try {
      parsed = Transcripts.parse(parseJson(response.text ?? ""));
    } catch {
      parsed = null;
    }
    for (const page of parsed?.pages ?? []) {
      const asked = urls.find((url) => urlKey(url) === urlKey(page.url));
      const text = page.text.replace(/\s+/g, " ").trim();
      if (asked && retrieved.has(urlKey(asked)) && text.length >= MIN_PAGE_CHARS) {
        found.set(urlKey(asked), { url: asked, title: "", text, markup: "", via: "url_context" });
      }
    }
  } catch (error) {
    if (error instanceof QuotaExhausted || signal.aborted) throw error;
    console.error("url context reading failed", error);
  }
  return found;
}

/** A markdown copy of the page on the same docs host: one the page links as an alternate, page.md or page/index.md. */
async function readMarkdownCopy(url: string, html: string, ledger: RunLedger, signal: AbortSignal): Promise<PageRead | null> {
  for (const candidate of markdownAlternates(url, html)) {
    if (!ledger.accepts(candidate)) continue;
    const markdown = await downloadPlainText(candidate, signal);
    const text = markdownToText(markdown);
    if (text.length >= MIN_PAGE_CHARS) return { url: candidate, title: markdownTitle(markdown), text, markup: markdown, via: "markdown" };
  }
  return null;
}

const slugWords = (url: string) => (new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "").split(/[-_.]+/).filter((word) => word.length > 2);

/**
 * The docs host's llms.txt lists its pages, usually as markdown: the entry that
 * best matches this page's own words and the stage's topics is read. Failing
 * that, llms-full.txt, a copy of the whole docs site, is read once.
 */
async function readFromLlmsFiles(url: string, topics: string[], used: Set<string>, ledger: RunLedger, signal: AbortSignal): Promise<PageRead | null> {
  const host = hostOf(url);
  if (!host) return null;
  const { llms } = await siteIndex(host, ledger, signal);
  const fresh = (link: string) => ledger.accepts(link) && !used.has(urlKey(link)) && !ledger.fetched.get(urlKey(link))?.text;
  for (const candidate of rankLinks(llms, [...slugWords(url), ...topics], fresh, 2)) {
    const markdown = await downloadPlainText(candidate, signal);
    const text = markdownToText(markdown);
    if (text.length >= MIN_PAGE_CHARS) return { url: candidate, title: markdownTitle(markdown), text, markup: markdown, via: "llms_txt" };
  }

  const full = llmsFiles(host).full;
  if (!ledger.accepts(full) || used.has(urlKey(full)) || ledger.fetched.get(urlKey(full))?.text) return null;
  const markdown = await downloadPlainText(full, signal);
  const text = markdownToText(markdown);
  return text.length >= MIN_FULL_COPY_CHARS ? { url: full, title: `${host} llms-full.txt`, text, markup: markdown, via: "llms_txt" } : null;
}

/** Another official page from the docs host's sitemap that covers the stage's topics, read with a plain fetch. */
async function readSitemapAlternative(url: string, topics: string[], used: Set<string>, ledger: RunLedger, signal: AbortSignal): Promise<PageRead | null> {
  const host = hostOf(url);
  if (!host) return null;
  const { sitemap } = await siteIndex(host, ledger, signal);
  const fresh = (link: string) =>
    ledger.accepts(link) && isDiscoverable(link) && !used.has(urlKey(link)) && !ledger.fetched.get(urlKey(link))?.text && !ledger.unreadable.has(urlKey(link));
  for (const candidate of rankLinks(sitemap, topics, fresh, 2)) {
    const read = await readPage(candidate, ledger, signal);
    if (read.text.length >= MIN_USEFUL_CHARS && ledger.accepts(read.url)) return { ...read, via: "sitemap" };
  }
  return null;
}

/**
 * The other ways of reading a page a plain fetch couldn't, in order, stopping
 * at the first that works: Gemini URL context on the same page, a plain-text
 * copy on the docs domain (.md, llms.txt, llms-full.txt), then another official
 * page from the sitemap. Every result must be on the provider's official domains.
 */
export async function readAnotherWay(
  weak: { url: string; markup: string }[],
  topics: string[],
  ledger: RunLedger,
  signal: AbortSignal,
): Promise<Map<string, PageRead>> {
  const found = await readWithUrlContext(
    weak.map((page) => page.url),
    ledger,
    signal,
  );
  const used = new Set([...found.values()].map((page) => urlKey(page.url)));
  for (const page of weak) {
    if (found.has(urlKey(page.url))) continue;
    const read =
      (await readMarkdownCopy(page.url, page.markup, ledger, signal)) ??
      (await readFromLlmsFiles(page.url, topics, used, ledger, signal)) ??
      (await readSitemapAlternative(page.url, topics, used, ledger, signal));
    if (!read) continue;
    found.set(urlKey(page.url), read);
    used.add(urlKey(read.url));
  }
  return found;
}

/**
 * Without search, the model only knows a provider's top-level pages. This finds
 * the deep ones from the site itself: links on those pages, plus its sitemap
 * and llms.txt. They're only leads. A page still has to come back with text to count.
 */
async function discoverPages(
  urls: string[],
  domains: string[],
  topics: string[],
  limit: number,
  isAllowed: (url: string) => boolean,
  ledger: RunLedger,
  signal: AbortSignal,
) {
  const hosts = [...new Set([...urls.flatMap((url) => hostOf(url) ?? []), ...domains])];
  const [pages, indexes] = await Promise.all([
    Promise.all(urls.map((url) => readPage(url, ledger, signal))),
    Promise.all(hosts.map((host) => siteIndex(host, ledger, signal))),
  ]);
  const onDomain = (url: string) => {
    const host = hostOf(url);
    return host !== null && domains.some((domain) => isUnder(host, domain)) && isAllowed(url) && isDiscoverable(url);
  };
  const links = [...pages.flatMap((page) => linksIn(page.markup, page.url)), ...indexes.flatMap((index) => [...index.sitemap, ...index.llms])];
  return rankLinks(links, topics, onDomain, limit);
}

/**
 * Reads pages and keeps those with real text that land on an accepted official
 * source, following redirects (api.slack.com -> docs.slack.dev). A page a plain
 * fetch can't read gets the other ways of reading, but only the stage's
 * best-ranked pages, or every page when too few could be read: those are the
 * pages the stage depends on, and the extra ways cost quota.
 */
async function readOurselves(urls: string[], topics: string[], ledger: RunLedger, signal: AbortSignal) {
  const reads = await Promise.all(urls.map((url) => readPage(url, ledger, signal)));
  const usable = (read: PageRead) => read.text.length >= MIN_USEFUL_CHARS && Boolean(read.via) && ledger.accepts(read.url);
  const readable = reads.filter(usable).length;
  const weak = urls
    .map((url, index) => ({ url, read: reads[index], rank: index }))
    .filter(({ url, read, rank }) => !usable(read) && ledger.accepts(url) && !isEndpointReferencePage(url) && (rank < MAIN_PAGES || readable < MIN_PAGES_WITH_TEXT))
    .map(({ url, read }) => ({ url, markup: read.markup }));
  const rescued = weak.length > 0 ? await readAnotherWay(weak, topics, ledger, signal) : new Map<string, PageRead>();

  const pages = urls.map((url, index) => {
    const read = rescued.get(urlKey(url)) ?? reads[index];
    if (read.text.length < MIN_PAGE_CHARS || !read.via || !ledger.accepts(read.url)) {
      ledger.markUnreadable(url);
      return null;
    }
    return { url: read.url, title: read.title, text: read.text, via: read.via };
  });
  const unique = new Map<string, NonNullable<(typeof pages)[number]>>();
  for (const page of pages) if (page && !unique.has(urlKey(page.url))) unique.set(urlKey(page.url), page);
  return [...unique.values()];
}

/**
 * Pages for a checklist item the first pass didn't answer. With Google Search
 * on, one search restricted to the official sites; without it, the site's own
 * index (sitemap, llms.txt, and the links on pages already read), ranked for
 * the item. Either way only official pages not read yet come back.
 */
async function findPages(request: FindPagesRequest): Promise<FindPagesResult> {
  const { query, topics, domains, ledger, signal } = request;
  const fresh = (url: string) => ledger.accepts(url) && !isLocaleVariant(url) && !ledger.fetched.get(urlKey(url))?.text && !ledger.unreadable.has(urlKey(url));

  if (searchEnabled()) {
    const response = await generate(`Search for: ${query}${siteHint(domains)}\n\nList the official pages that answer it.`, { tools: [{ googleSearch: {} }] }, ledger, signal);
    const urls = await recordSearch(response, ledger);
    urls.forEach((url) => ledger.addSearched(url));
    return { urls: [...new Set(urls.filter(fresh))].slice(0, 3), method: "search" };
  }

  const hosts = [...new Set([...domains, ...[...ledger.fetched.values()].flatMap((page) => hostOf(page.url) ?? [])])];
  const indexes = await Promise.all(hosts.map((host) => siteIndex(host, ledger, signal)));
  const onPages = await Promise.all([...ledger.reads.values()]);
  const links = [...indexes.flatMap((index) => [...index.sitemap, ...index.llms]), ...onPages.flatMap((page) => linksIn(page.markup, page.url))];
  return { urls: rankLinks(links, topics, (url) => fresh(url) && isDiscoverable(url), 3), method: "site_index" };
}

async function readPages<T extends z.ZodType>(request: ResearchRequest<T>, found: string): Promise<z.infer<T>> {
  const { system, user, schema, read, ledger, onDomains, signal } = request;
  const { urls, allowedDomains, topics, maxUses, pinned = [], skip = [] } = read!;
  // Pages named up front come first; discovery fills the remaining reads.
  const skipped = new Set(skip.map(urlKey));
  const allowed = (url: string) => ledger.accepts(url) && !isLocaleVariant(url) && !skipped.has(urlKey(url));
  const given = [...new Set(urls.filter(allowed))];
  const deep = await discoverPages(urls, allowedDomains, topics, maxUses * 2, allowed, ledger, signal);
  // Every candidate competes on the stage's topics, so a home page read earlier
  // can't take a slot from the page that covers this stage. Unranked pages that
  // were named up front only fill whatever is left.
  const pages = [...new Set([...pinned.filter(allowed), ...rankLinks([...given, ...deep], topics, allowed, maxUses), ...given])].slice(0, maxUses);

  const note = found ? `\n\nA search found this:\n${found}` : "";

  // Read the pages ourselves first. The model then answers from exactly the text
  // that the quote and claim checks use, instead of a tool's unseen copy of it.
  const texts = await readOurselves(pages, topics, ledger, signal);
  if (texts.length >= MIN_PAGES_WITH_TEXT) {
    const domains = present(texts.map((page) => ledger.addFetched(page)));
    ledger.addUsage({ fetches: texts.length });
    if (domains.length > 0) onDomains?.(domains);
    // The best-ranked pages come first and get more room: they're the main docs.
    const body = texts
      .map((page, index) => `<page url="${page.url}">\n${excerpt(page.text, [topics.join(" ")], index < MAIN_PAGES ? MAIN_PAGE_CHARS : undefined)}\n</page>`)
      .join("\n\n");
    return structured({
      system,
      user: `${user}${note}\n\nThe provider's official pages are below, already read for you. Use only them. Cite each answer with its page's url exactly as given, and copy quotes word for word from the page text.\n\n${body}`,
      schema,
      ledger,
      signal,
    });
  }

  // Too few pages came back with readable text (often JavaScript-only docs), so
  // fall back to URL context, which can render some of them.
  const prompt = `${user}${note}\n\nRead these pages:\n${pages.join("\n")}${askForJson(schema)}`;
  const response = await generate(prompt, { systemInstruction: system, tools: [{ urlContext: {} }] }, ledger, signal);

  // Gemini doesn't return the page text, so pageText fetches it when needed.
  const domains = present(retrievedUrls(response, ledger).map((url) => ledger.addFetched({ url, title: "", text: "" })));
  if (domains.length > 0) onDomains?.(domains);
  return finish(response.text ?? "", schema, ledger, signal);
}

async function research<T extends z.ZodType>(request: ResearchRequest<T>): Promise<z.infer<T>> {
  const { system, user, schema, search, read, ledger, onDomains, signal } = request;

  if (search && !searchEnabled()) return researchWithoutSearch(request);
  if (!search) return readPages(request, "");

  // One tool per call: Google documents combining tools for Gemini 3 and newer only.
  const prompt = `${user}${siteHint(search.allowedDomains)}${read ? "" : askForJson(schema)}`;
  const config = { systemInstruction: system, tools: [{ googleSearch: {} }] };

  let response = await generate(prompt, config, ledger, signal);
  let urls = await recordSearch(response, ledger);

  // The model can answer from memory without searching, which proves nothing.
  if (urls.length === 0) {
    response = await generate(`${prompt}\n\nYou must run a Google Search for this. Don't answer from memory.`, config, ledger, signal);
    urls = await recordSearch(response, ledger);
  }

  const domains = present(urls.map((url) => ledger.addSearched(url)));
  if (domains.length > 0) onDomains?.(domains);

  const text = response.text ?? "";
  if (!read) return finish(text, schema, ledger, signal);

  const onOfficialSite = (url: string) => {
    const host = hostOf(url);
    return host !== null && read.allowedDomains.some((domain) => isUnder(host, domain));
  };
  return readPages({ ...request, read: { ...read, urls: [...new Set([...urls.filter(onOfficialSite), ...read.urls])] } }, text);
}

/** Validates a research reply. A garbled one gets one tool-free call to fix its shape, using only what it said. */
async function finish<T extends z.ZodType>(
  text: string,
  schema: T,
  ledger: RunLedger,
  signal: AbortSignal,
): Promise<z.infer<T>> {
  try {
    return schema.parse(parseJson(text));
  } catch {
    if (!text.trim()) throw new AgentError("The model returned an empty reply. Please try again.");
    const pages = [...ledger.fetched.values()].map((page) => page.url).join("\n");
    return structured({
      system: "Convert the research notes you're given into the requested JSON. Add nothing that isn't in the notes.",
      user: `<research_notes>\n${text}\n</research_notes>\n\n<pages_read>\n${pages}\n</pages_read>`,
      schema,
      ledger,
      signal,
    });
  }
}

export const geminiProvider: LlmProvider = {
  name: "gemini",

  isConfigured: () => Boolean(geminiApiKey()),

  // Free tier. Tokens are still counted in the stats.
  estimateCost: () => 0,

  research,

  write: structured,

  findPages,

  /**
   * URL context says which pages it retrieved but doesn't return their text, so
   * this reads the page itself. It only reads pages the ledger already holds,
   * and rejects a redirect that leaves the page's site.
   */
  async pageText(url, ledger, signal) {
    const page = ledger.fetched.get(urlKey(url));
    if (!page) return "";
    if (page.text) return page.text;

    const host = hostOf(page.url);
    if (!host || !page.url.startsWith("https://")) return "";

    const fetched = await readPage(page.url, ledger, signal);
    const finalHost = hostOf(fetched.url);
    // A redirect may only land on the same site or another official docs page.
    const stays = finalHost && (isUnder(finalHost, host) || isUnder(host, finalHost) || ledger.accepts(fetched.url));
    // No text from a plain fetch: a markdown copy on the same docs host, which costs no model call.
    const read = fetched.text && fetched.via && stays ? fetched : await readMarkdownCopy(page.url, fetched.markup, ledger, signal);
    if (!read?.text || !read.via) {
      ledger.markUnreadable(page.url);
      return "";
    }

    if (read.title && !page.title) page.title = read.title;
    page.text = read.text;
    page.via = read.via;
    ledger.unreadable.delete(urlKey(page.url));
    return page.text;
  },
};
