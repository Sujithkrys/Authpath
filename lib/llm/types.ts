import type { z } from "zod";

import type { RunLedger, UsageTotals } from "@/lib/llm/ledger";

/** A problem to tell the user about in plain words, rather than a crash. */
export class AgentError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
    /** The technical reason. Sent with the error for debugging, never shown on the page. */
    readonly detail?: string,
  ) {
    super(message);
  }
}

/** The provider's daily quota is gone on every model. Nothing can run until it resets. */
export class QuotaExhausted extends AgentError {
  constructor(message: string, detail?: string) {
    super(message, false, detail);
  }
}

interface StageRequest<T extends z.ZodType> {
  system: string;
  user: string;
  schema: T;
  ledger: RunLedger;
  signal: AbortSignal;
}

export interface ResearchRequest<T extends z.ZodType> extends StageRequest<T> {
  /** Let the model search the web. */
  search?: { maxUses: number; allowedDomains?: string[]; blockedDomains?: string[] };
  /** Let the model read specific pages. */
  read?: {
    maxUses: number;
    allowedDomains: string[];
    urls: string[];
    /** Words in a URL that suggest a page covers this stage, most telling first. */
    topics: string[];
    /** Pages that must be read whatever the topics, e.g. the registration page for the approval stage. */
    pinned?: string[];
    /** Without search, whether to ask the model for more pages first. Defaults to true. */
    propose?: boolean;
    /** Pages already read. Links are still found on them, but they aren't read again. */
    skip?: string[];
  };
  /** Pages to confirm exist when a provider can't search, taken from the stage's result. */
  candidates?: (result: z.infer<T>) => string[];
  onDomains?: (domains: string[]) => void;
}

export type WriteRequest<T extends z.ZodType> = StageRequest<T>;

/** One targeted lookup in the gap-filling round. */
export interface FindPagesRequest {
  /** A search query, e.g. "Facebook OAuth redirect URI". */
  query: string;
  /** Words in a URL that suggest a page covers the item. */
  topics: string[];
  domains: string[];
  ledger: RunLedger;
  signal: AbortSignal;
}

export interface FindPagesResult {
  /** Official pages not read yet, best first. */
  urls: string[];
  /** Google Search, or the site's own index (sitemap, llms.txt, links on pages read). */
  method: "search" | "site_index";
}

/** What the pipeline needs from a model. Everything else stays provider-neutral. */
export interface LlmProvider {
  name: "gemini" | "anthropic";
  isConfigured(): boolean;
  estimateCost(usage: UsageTotals): number;
  /** A stage with web access. Whatever it retrieves is recorded in the ledger. */
  research<T extends z.ZodType>(request: ResearchRequest<T>): Promise<z.infer<T>>;
  /** A stage with no tools that returns schema-shaped JSON. */
  write<T extends z.ZodType>(request: WriteRequest<T>): Promise<z.infer<T>>;
  /** The text of a page recorded in the ledger, for checking quotes against it. */
  pageText(url: string, ledger: RunLedger, signal: AbortSignal): Promise<string>;
  /** Pages for one unanswered checklist item. A provider without it skips the gap-filling round. */
  findPages?(request: FindPagesRequest): Promise<FindPagesResult>;
}
