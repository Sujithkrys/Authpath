import { ApiError, GoogleGenAI, UrlRetrievalStatus, type GenerateContentConfig, type GenerateContentResponse } from "@google/genai";
import { z } from "zod";

import { htmlToText, linksIn, pageContentText, rankLinks } from "@/lib/agent/evidence";
import { isDiscoverable, isLocaleVariant } from "@/lib/agent/sources";
import { hostOf, isUnder, urlKey } from "@/lib/agent/urls";
import { excerpt } from "@/lib/agent/verify";
import type { RunLedger } from "@/lib/llm/ledger";
import { AgentError, QuotaExhausted, type LlmProvider, type ResearchRequest, type WriteRequest } from "@/lib/llm/types";

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

/**
 * Without search, the model only knows a provider's top-level pages. This finds
 * the deep ones from the site itself: links on those pages, plus its sitemap.
 * They're only leads. A page still has to come back from URL context to count.
 */
async function discoverPages(
  urls: string[],
  domains: string[],
  topics: string[],
  limit: number,
  isAllowed: (url: string) => boolean,
  signal: AbortSignal,
) {
  const hosts = urls.flatMap((url) => hostOf(url) ?? []);
  const sitemaps = [...new Set([...hosts, ...domains])].map((host) => `https://${host}/sitemap.xml`);
  const pages = await Promise.all([...urls, ...sitemaps].map((url) => download(url, signal)));
  const onDomain = (url: string) => {
    const host = hostOf(url);
    return host !== null && domains.some((domain) => isUnder(host, domain)) && isAllowed(url) && isDiscoverable(url);
  };
  return rankLinks(pages.flatMap(({ text, finalUrl }) => linksIn(text, finalUrl)), topics, onDomain, limit);
}

/** Below this many readable pages, URL context reads instead. */
const MIN_PAGES_WITH_TEXT = 2;
/** Text shorter than this is a shell page that needs JavaScript, not docs. */
const MIN_PAGE_CHARS = 400;
/** How many of the best-ranked pages get the larger text allowance. */
const MAIN_PAGES = 3;
const MAIN_PAGE_CHARS = 12_000;

/**
 * Downloads pages and keeps those with real text that land on an accepted
 * official source, following redirects (api.slack.com -> docs.slack.dev).
 */
async function readOurselves(urls: string[], ledger: RunLedger, signal: AbortSignal) {
  const pages = await Promise.all(
    urls.map(async (url) => {
      const { text: html, finalUrl } = await download(url, signal);
      if (!html || !ledger.accepts(finalUrl)) return null;
      const text = pageContentText(html);
      if (text.length < MIN_PAGE_CHARS) return null;
      const title = htmlToText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim().slice(0, 140);
      return { url: finalUrl, title, text };
    }),
  );
  const unique = new Map<string, { url: string; title: string; text: string }>();
  for (const page of pages) if (page && !unique.has(urlKey(page.url))) unique.set(urlKey(page.url), page);
  return [...unique.values()];
}

async function readPages<T extends z.ZodType>(request: ResearchRequest<T>, found: string): Promise<z.infer<T>> {
  const { system, user, schema, read, ledger, onDomains, signal } = request;
  const { urls, allowedDomains, topics, maxUses, pinned = [] } = read!;
  // Pages named up front come first; discovery fills the remaining reads.
  const allowed = (url: string) => ledger.accepts(url) && !isLocaleVariant(url);
  const given = [...new Set(urls.filter(allowed))];
  const deep = await discoverPages(urls, allowedDomains, topics, maxUses * 2, allowed, signal);
  // Every candidate competes on the stage's topics, so a home page read earlier
  // can't take a slot from the page that covers this stage. Unranked pages that
  // were named up front only fill whatever is left.
  const pages = [...new Set([...pinned.filter(allowed), ...rankLinks([...given, ...deep], topics, allowed, maxUses), ...given])].slice(0, maxUses);

  const note = found ? `\n\nA search found this:\n${found}` : "";

  // Read the pages ourselves first. The model then answers from exactly the text
  // that the quote and claim checks use, instead of a tool's unseen copy of it.
  const texts = await readOurselves(pages, ledger, signal);
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

    const { text, finalUrl } = await download(page.url, signal);
    const finalHost = hostOf(finalUrl);
    // A redirect may only land on the same site or another official docs page.
    const stays = finalHost && (isUnder(finalHost, host) || isUnder(host, finalHost) || ledger.accepts(finalUrl));
    if (!text || !stays) return "";

    const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    if (title && !page.title) page.title = htmlToText(title).trim().slice(0, 140);
    page.text = pageContentText(text);
    return page.text;
  },
};
