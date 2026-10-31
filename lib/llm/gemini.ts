import { ApiError, GoogleGenAI, UrlRetrievalStatus, type GenerateContentConfig, type GenerateContentResponse } from "@google/genai";
import { z } from "zod";

import { hostOf, htmlToText, isUnder, urlKey } from "@/lib/agent/evidence";
import type { RunLedger } from "@/lib/llm/ledger";
import { AgentError, type LlmProvider, type ResearchRequest, type WriteRequest } from "@/lib/llm/types";

/**
 * Google Search isn't available on the free tier for Gemini 3 and newer, and
 * the 2.5 models that have it are closed to accounts that haven't used them, so
 * by default this runs on URL context alone. GEMINI_SEARCH=true turns Search on
 * for a key that can use it.
 * https://ai.google.dev/gemini-api/docs/pricing
 */
const DEFAULT_MODEL = "gemini-3.8-flash";
const BACKUP_MODEL = "gemini-3.5-flash-lite";
const searchEnabled = () => process.env.GEMINI_SEARCH === "true";

const NO_SEARCH_NOTE = `Web search isn't available in this run. Work from what you know about this provider, and name the official pages you're confident exist. Those URLs get checked by loading them, so a guess that doesn't load is simply discarded. If you don't recognise the app, say not_found.`;

const CandidatePages = z.object({
  urls: z.array(z.string()).describe("Up to 3 official URLs most likely to cover this."),
});

const MAX_OUTPUT_TOKENS = 16_000;
const PAGE_FETCH_TIMEOUT_MS = 10_000;
const MAX_PAGE_BYTES = 3_000_000;
const REDIRECT_TIMEOUT_MS = 5_000;

const QUOTA_BUSY = "The free AI quota is busy, try again in a minute.";
const QUOTA_USED_UP = "The free AI quota for today has run out. It resets at midnight Pacific time.";

/** Free-tier quotas are per model, so a second model covers the first being busy. An explicit GEMINI_MODEL is used alone. */
const models = () => (process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : [DEFAULT_MODEL, BACKUP_MODEL]);

function client() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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

async function generate(
  contents: string,
  config: GenerateContentConfig,
  ledger: RunLedger,
  signal: AbortSignal,
): Promise<GenerateContentResponse> {
  const tried = models();

  for (const [index, model] of tried.entries()) {
    try {
      const response = await client().models.generateContent({
        model,
        contents,
        config: { maxOutputTokens: MAX_OUTPUT_TOKENS, abortSignal: signal, ...config },
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
      if (index === tried.length - 1 || !worthTryingAnother(error)) throw plainError(error);
      console.warn("gemini fallback", model, error);
    }
  }

  throw new AgentError("Something went wrong while researching this app.");
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
      return host !== null && read.allowedDomains.some((domain) => isUnder(host, domain));
    });
    const pages = [...new Set([...official, ...read.urls])].slice(0, read.maxUses);
    return readPages({ ...request, read: { ...read, urls: pages } }, "");
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

async function readPages<T extends z.ZodType>(request: ResearchRequest<T>, found: string): Promise<z.infer<T>> {
  const { system, user, schema, read, ledger, onDomains, signal } = request;
  const note = found ? `\n\nA search found this:\n${found}` : "";
  const prompt = `${user}${note}\n\nRead these pages:\n${read!.urls.join("\n")}${askForJson(schema)}`;
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
  const pages = [...new Set([...urls.filter(onOfficialSite), ...read.urls])].slice(0, read.maxUses);
  return readPages({ ...request, read: { ...read, urls: pages } }, text);
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
    return structured({
      system: "Convert the research notes you're given into the requested JSON. Add nothing that isn't in the notes.",
      user: `<research_notes>\n${text}\n</research_notes>`,
      schema,
      ledger,
      signal,
    });
  }
}

export const geminiProvider: LlmProvider = {
  name: "gemini",

  isConfigured: () => Boolean(process.env.GEMINI_API_KEY),

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

    const response = await fetch(page.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Authpath docs checker)" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS)]),
    });
    const finalHost = hostOf(response.url);
    if (!response.ok || !finalHost || (!isUnder(finalHost, host) && !isUnder(host, finalHost))) return "";

    const bytes = new Uint8Array(await response.arrayBuffer()).slice(0, MAX_PAGE_BYTES);
    page.text = htmlToText(new TextDecoder().decode(bytes));
    return page.text;
  },
};
