import type { z } from "zod";

import type { RunLedger, UsageTotals } from "@/lib/llm/ledger";

/** A problem to tell the user about in plain words, rather than a crash. */
export class AgentError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message);
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
  read?: { maxUses: number; allowedDomains: string[]; urls: string[] };
  onDomains?: (domains: string[]) => void;
}

export type WriteRequest<T extends z.ZodType> = StageRequest<T>;

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
}
