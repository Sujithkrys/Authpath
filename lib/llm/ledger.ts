import type { GenerationStats } from "@/lib/agent/events";
import { type FetchedPage, hostOf, isUnder, urlKey } from "@/lib/agent/evidence";

export interface UsageTotals {
  modelCalls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  searches: number;
  fetches: number;
}

/**
 * Everything that really happened in a run, whichever provider did it. The
 * evidence rules read from this, so a page only counts as read if the provider
 * reported retrieving it, not because the model says it did.
 */
export class RunLedger {
  readonly searched = new Map<string, string>();
  readonly fetched = new Map<string, FetchedPage>();
  /** Pages a provider retrieved outside the official domains. Never used as evidence. */
  readonly rejected: string[] = [];

  private readonly startedAt = Date.now();
  private officialDomains: string[] | null = null;
  private usage: UsageTotals = { modelCalls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0, fetches: 0 };

  constructor(private readonly estimateCost: (usage: UsageTotals) => number) {}

  /** From here on, only pages on these domains count as evidence. */
  restrictTo(domains: string[]) {
    this.officialDomains = domains;
  }

  /** Records a search result. Returns its domain the first time it's seen. */
  addSearched(url: string): string | null {
    const host = hostOf(url);
    if (!host) return null;
    const isNew = !this.searched.has(urlKey(url));
    this.searched.set(urlKey(url), url);
    return isNew ? host : null;
  }

  /** Records a retrieved page. Returns its domain the first time it's accepted. */
  addFetched(page: FetchedPage): string | null {
    const host = hostOf(page.url);
    if (!host) return null;
    if (this.officialDomains && !this.officialDomains.some((domain) => isUnder(host, domain))) {
      this.rejected.push(page.url);
      return null;
    }
    const isNew = !this.fetched.has(urlKey(page.url));
    if (isNew || page.text) this.fetched.set(urlKey(page.url), page);
    return isNew ? host : null;
  }

  addUsage(usage: Partial<UsageTotals>) {
    for (const key of Object.keys(usage) as (keyof UsageTotals)[]) {
      this.usage[key] += usage[key] ?? 0;
    }
  }

  stats(): GenerationStats {
    const { modelCalls, input, output, cacheRead, cacheWrite, searches, fetches } = this.usage;
    return {
      durationMs: Date.now() - this.startedAt,
      modelCalls,
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      webSearches: searches,
      webFetches: fetches,
      estimatedCostUsd: Number(this.estimateCost(this.usage).toFixed(4)),
    };
  }
}
