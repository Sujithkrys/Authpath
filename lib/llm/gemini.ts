import { ApiError, GoogleGenAI, UrlRetrievalStatus, type GenerateContentConfig, type GenerateContentResponse } from "@google/genai";
import { z } from "zod";

import { hostOf, htmlToText, isUnder, urlKey } from "@/lib/agent/evidence";
import type { RunLedger } from "@/lib/llm/ledger";
import { AgentError, type LlmProvider, type ResearchRequest, type WriteRequest } from "@/lib/llm/types";

/**
 * The only Flash text model with Google Search on the free tier: up to 500
 * requests a day. Gemini 3 and newer list Search as "Not available" for free.
 * https://ai.google.dev/gemini-api/docs/pricing
 */
const DEFAULT_MODEL = "gemini-2.5-flash";

const MAX_OUTPUT_TOKENS = 16_000;
const PAGE_FETCH_TIMEOUT_MS = 10_000;
const MAX_PAGE_BYTES = 3_000_000;
const REDIRECT_TIMEOUT_MS = 5_000;

const QUOTA_BUSY = "The free AI quota is busy, try again in a minute.";
const QUOTA_USED_UP = "The free AI quota for today has run out. It resets at midnight Pacific time.";

const model = () => process.env.GEMINI_MODEL || DEFAULT_MODEL;

function client() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

/** Puts the SDK's errors into words a person can act on. */
function plainError(error: unknown): unknown {
  if (!(error instanceof ApiError)) return error;

  console.error("gemini error", error.status, error.message);
  if (error.status === 429) {
    return /per.?day|daily/i.test(error.message) ? new AgentError(QUOTA_USED_UP, false) : new AgentError(QUOTA_BUSY);
  }
  if (error.status === 503) return new AgentError(QUOTA_BUSY);
  if (error.status === 401 || error.status === 403) return new AgentError("The generator isn't set up correctly.", false);
  return error;
}

async function generate(
  contents: string,
  config: GenerateContentConfig,
  ledger: RunLedger,
  signal: AbortSignal,
): Promise<GenerateContentResponse> {
  try {
    const response = await client().models.generateContent({
      model: model(),
      contents,
      config: { temperature: 0.2, maxOutputTokens: MAX_OUTPUT_TOKENS, abortSignal: signal, ...config },
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
    throw plainError(error);
  }
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

function recordRetrievals(response: GenerateContentResponse, ledger: RunLedger): string[] {
  const entries = response.candidates?.[0]?.urlContextMetadata?.urlMetadata ?? [];
  ledger.addUsage({ fetches: entries.length });

  const domains: (string | null)[] = [];
  for (const entry of entries) {
    if (entry.retrievedUrl && entry.urlRetrievalStatus === UrlRetrievalStatus.URL_RETRIEVAL_STATUS_SUCCESS) {
      // Gemini doesn't return the page text, so pageText fetches it when needed.
      domains.push(ledger.addFetched({ url: entry.retrievedUrl, title: "", text: "" }));
    }
  }
  return [...new Set(domains.filter((domain): domain is string => Boolean(domain)))];
}

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

async function research<T extends z.ZodType>(request: ResearchRequest<T>): Promise<z.infer<T>> {
  const { system, user, schema, search, read, ledger, onDomains, signal } = request;
  const report = (domains: string[]) => {
    if (domains.length > 0) onDomains?.(domains);
  };
  const addSearchResults = (urls: string[]) =>
    report([...new Set(urls.map((url) => ledger.addSearched(url)).filter((domain): domain is string => Boolean(domain)))]);

  let text = "";

  if (search) {
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

    addSearchResults(urls);
    text = response.text ?? "";

    if (!read) return finish(text, schema, ledger, signal);

    const onOfficialSite = (url: string) => {
      const host = hostOf(url);
      return host !== null && read.allowedDomains.some((domain) => isUnder(host, domain));
    };
    read.urls = [...new Set([...urls.filter(onOfficialSite), ...read.urls])].slice(0, read.maxUses);
  }

  if (read) {
    const pages = read.urls.join("\n");
    const found = text ? `\n\nA search found this:\n${text}` : "";
    const prompt = `${user}${found}\n\nRead these pages:\n${pages}${askForJson(schema)}`;
    const response = await generate(prompt, { systemInstruction: system, tools: [{ urlContext: {} }] }, ledger, signal);
    report(recordRetrievals(response, ledger));
    text = response.text ?? "";
  }

  return finish(text, schema, ledger, signal);
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
