import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import type { FetchedPage } from "@/lib/agent/evidence";
import { urlKey } from "@/lib/agent/evidence";
import type { GenerationStats } from "@/lib/agent/events";

export const MODEL = "claude-sonnet-5-5";

const MAX_TOKENS = 8000;
const MAX_TURNS = 6;
/** Per-page cap, so one huge docs page can't run up the bill. */
const MAX_PAGE_TOKENS = 12_000;

// Claude Sonnet 5.5 list prices, in dollars per million tokens, plus $10 per 1,000 searches.
const PRICE = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5, search: 0.01 };

type Tool = Anthropic.Beta.Messages.BetaToolUnion;
type ContentBlock = Anthropic.Beta.Messages.BetaContentBlock;
type Usage = Anthropic.Beta.Messages.BetaUsage;

export function webSearchTool(maxUses: number, domains: { allowed?: string[]; blocked?: string[] }): Tool {
  return {
    type: "web_search_20260318",
    name: "web_search",
    max_uses: maxUses,
    // Direct calls keep every result visible to us. Through dynamic filtering
    // they'd run inside code execution, which is harder to account for.
    allowed_callers: ["direct"],
    ...(domains.allowed ? { allowed_domains: domains.allowed } : { blocked_domains: domains.blocked }),
  };
}

export function webFetchTool(maxUses: number, allowedDomains: string[]): Tool {
  return {
    type: "web_fetch_20260318",
    name: "web_fetch",
    max_uses: maxUses,
    allowed_callers: ["direct"],
    allowed_domains: allowedDomains,
    max_content_tokens: MAX_PAGE_TOKENS,
  };
}

/** A problem to tell the user about in plain words, rather than a crash. */
export class AgentError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message);
  }
}

/**
 * Everything that really happened in a run. The evidence rules read from this,
 * so a page only counts as fetched if the API returned it.
 */
export class RunLedger {
  readonly searched = new Map<string, string>();
  readonly fetched = new Map<string, FetchedPage>();
  private readonly startedAt = Date.now();
  private usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0, fetches: 0 };

  /** Records a tool result block and returns any newly seen domains. */
  record(block: ContentBlock): string[] {
    const domains: string[] = [];
    const note = (url: string) => {
      try {
        domains.push(new URL(url).hostname.replace(/^www\./, ""));
      } catch {
        // A malformed URL can't be shown as a chip, and can't count as evidence.
      }
    };

    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const result of block.content) {
        if (!this.searched.has(urlKey(result.url))) note(result.url);
        this.searched.set(urlKey(result.url), result.url);
      }
    }

    if (block.type === "web_fetch_tool_result" && block.content.type === "web_fetch_result") {
      const { url, content } = block.content;
      if (!this.fetched.has(urlKey(url))) note(url);
      this.fetched.set(urlKey(url), {
        url,
        title: content.title ?? "",
        text: content.source.type === "text" ? content.source.data : "",
      });
    }

    return [...new Set(domains)];
  }

  addUsage(usage: Usage) {
    this.usage.input += usage.input_tokens;
    this.usage.output += usage.output_tokens;
    this.usage.cacheRead += usage.cache_read_input_tokens ?? 0;
    this.usage.cacheWrite += usage.cache_creation_input_tokens ?? 0;
    this.usage.searches += usage.server_tool_use?.web_search_requests ?? 0;
    this.usage.fetches += usage.server_tool_use?.web_fetch_requests ?? 0;
  }

  stats(): GenerationStats {
    const { input, output, cacheRead, cacheWrite, searches, fetches } = this.usage;
    const cost =
      (input * PRICE.input + output * PRICE.output + cacheRead * PRICE.cacheRead + cacheWrite * PRICE.cacheWrite) /
        1_000_000 +
      searches * PRICE.search;

    return {
      durationMs: Date.now() - this.startedAt,
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      webSearches: searches,
      webFetches: fetches,
      estimatedCostUsd: Number(cost.toFixed(4)),
    };
  }
}

function submitTool(schema: z.ZodType): Tool {
  const { $schema: _dropped, ...inputSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  return {
    name: "submit",
    description: "Submit your finished result. Call this exactly once, as your final action.",
    strict: true,
    input_schema: inputSchema as Anthropic.Beta.Messages.BetaTool.InputSchema,
  };
}

interface StageOptions<T extends z.ZodType> {
  system: string;
  user: string;
  schema: T;
  webTools?: Tool[];
  ledger: RunLedger;
  onDomains?: (domains: string[]) => void;
  signal: AbortSignal;
}

/**
 * Runs one stage as its own conversation. Results come back through a strict
 * `submit` tool rather than a response format, because web search always
 * returns citations and those can't be combined with a response format.
 */
export async function runStage<T extends z.ZodType>({
  system,
  user,
  schema,
  webTools = [],
  ledger,
  onDomains,
  signal,
}: StageOptions<T>): Promise<z.infer<T>> {
  const client = new Anthropic();
  const tools = [...webTools, submitTool(schema)];
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: user }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        tools,
        messages,
      },
      { signal },
    );

    stream.on("streamEvent", (event) => {
      if (event.type === "content_block_start") {
        const domains = ledger.record(event.content_block);
        if (domains.length > 0) onDomains?.(domains);
      }
    });

    const message = await stream.finalMessage();
    ledger.addUsage(message.usage);
    message.content.forEach((block) => ledger.record(block));

    if (message.stop_reason === "refusal") {
      throw new AgentError("The model declined to research this app.", false);
    }
    if (message.stop_reason === "max_tokens") {
      throw new AgentError("The model ran out of room before finishing this step.");
    }

    const submitted = message.content.find((block) => block.type === "tool_use" && block.name === "submit");
    if (submitted?.type === "tool_use") return schema.parse(submitted.input);

    messages.push({ role: "assistant", content: message.content });
    if (message.stop_reason !== "pause_turn") {
      messages.push({ role: "user", content: "Now call submit with your result." });
    }
  }

  throw new AgentError("The agent didn't finish this step.");
}
