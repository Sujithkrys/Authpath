import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { urlKey } from "@/lib/agent/urls";
import type { RunLedger, UsageTotals } from "@/lib/llm/ledger";
import { AgentError, type LlmProvider, type ResearchRequest, type WriteRequest } from "@/lib/llm/types";

const MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 8000;
const MAX_TURNS = 6;
/** Per-page cap, so one huge docs page can't run up the bill. */
const MAX_PAGE_TOKENS = 12_000;

// Claude Sonnet 5.5 list prices, in dollars per million tokens, plus $10 per 1,000 searches.
const PRICE = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5, search: 0.01 };

type Tool = Anthropic.Beta.Messages.BetaToolUnion;
type ContentBlock = Anthropic.Beta.Messages.BetaContentBlock;

function webSearchTool(maxUses: number, domains: { allowed?: string[]; blocked?: string[] }): Tool {
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

function webFetchTool(maxUses: number, allowedDomains: string[]): Tool {
  return {
    type: "web_fetch_20260318",
    name: "web_fetch",
    max_uses: maxUses,
    allowed_callers: ["direct"],
    allowed_domains: allowedDomains,
    max_content_tokens: MAX_PAGE_TOKENS,
  };
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

/** Records a tool result block and returns any newly seen domains. */
function record(block: ContentBlock, ledger: RunLedger): string[] {
  const domains: (string | null)[] = [];

  if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
    for (const result of block.content) domains.push(ledger.addSearched(result.url));
  }

  if (block.type === "web_fetch_tool_result" && block.content.type === "web_fetch_result") {
    const { url, content } = block.content;
    domains.push(
      ledger.addFetched({
        url,
        title: content.title ?? "",
        text: content.source.type === "text" ? content.source.data : "",
      }),
    );
  }

  return [...new Set(domains.filter((domain): domain is string => Boolean(domain)))];
}

interface StageOptions<T extends z.ZodType> extends WriteRequest<T> {
  tools?: Tool[];
  onDomains?: (domains: string[]) => void;
}

/**
 * Runs one stage as its own conversation. Results come back through a strict
 * `submit` tool rather than a response format, because web search always
 * returns citations and those can't be combined with a response format.
 */
async function runStage<T extends z.ZodType>({
  system,
  user,
  schema,
  tools = [],
  ledger,
  onDomains,
  signal,
}: StageOptions<T>): Promise<z.infer<T>> {
  const client = new Anthropic();
  const allTools = [...tools, submitTool(schema)];
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
        tools: allTools,
        messages,
      },
      { signal },
    );

    stream.on("streamEvent", (event) => {
      if (event.type === "content_block_start") {
        const domains = record(event.content_block, ledger);
        if (domains.length > 0) onDomains?.(domains);
      }
    });

    const message = await stream.finalMessage();
    const { usage } = message;
    ledger.addUsage({
      modelCalls: 1,
      input: usage.input_tokens,
      output: usage.output_tokens,
      cacheRead: usage.cache_read_input_tokens ?? 0,
      cacheWrite: usage.cache_creation_input_tokens ?? 0,
      searches: usage.server_tool_use?.web_search_requests ?? 0,
      fetches: usage.server_tool_use?.web_fetch_requests ?? 0,
    });
    message.content.forEach((block) => record(block, ledger));

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

/** Puts the SDK's errors into words a person can act on. */
async function plainErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new AgentError("The research service is busy. Try again in a minute.");
    }
    if (error instanceof Anthropic.AuthenticationError) {
      throw new AgentError("The generator isn't set up correctly.", false);
    }
    throw error;
  }
}

export const anthropicProvider: LlmProvider = {
  name: "anthropic",

  isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),

  estimateCost: ({ input, output, cacheRead, cacheWrite, searches }: UsageTotals) =>
    (input * PRICE.input + output * PRICE.output + cacheRead * PRICE.cacheRead + cacheWrite * PRICE.cacheWrite) /
      1_000_000 +
    searches * PRICE.search,

  research<T extends z.ZodType>({ search, read, ...stage }: ResearchRequest<T>) {
    const tools: Tool[] = [];
    if (search) {
      tools.push(webSearchTool(search.maxUses, { allowed: search.allowedDomains, blocked: search.blockedDomains }));
    }
    if (read) tools.push(webFetchTool(read.maxUses, read.allowedDomains));

    const pages = read?.urls.length ? `\n\nThese pages can be fetched:\n${read.urls.join("\n")}` : "";
    return plainErrors(() => runStage({ ...stage, user: `${stage.user}${pages}`, tools }));
  },

  write: (request) => plainErrors(() => runStage(request)),

  // Web fetch returns the page text, so it's already in the ledger.
  pageText: async (url, ledger) => ledger.fetched.get(urlKey(url))?.text ?? "",
};
