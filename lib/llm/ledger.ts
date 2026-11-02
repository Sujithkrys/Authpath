import type { GenerationStats } from "@/lib/agent/events";
import type { FetchedPage } from "@/lib/agent/evidence";
import { hostOf, urlKey } from "@/lib/agent/urls";
import type { ReadMethod } from "@/types/guide";

/** At most this many extra URL context calls per guide to read pages a plain fetch couldn't, to stay inside the free quota. */
export const MAX_URL_CONTEXT_RESCUES = 2;

/** One attempt to read a page, shared by link discovery and reading so a page is fetched once. */
export interface PageRead {
  url: string;
  title: string;
  /** Readable text, "" when the page couldn't be read. */
  text: string;
  /** What links are found in: the page's HTML, or a markdown copy. */
  markup: string;
  via: ReadMethod | null;
}

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
  /** Each page read this run, so discovery and reading share one fetch. */
  readonly reads = new Map<string, Promise<PageRead>>();
  /** Per docs host, the links in its sitemap.xml and llms.txt, fetched once. */
  readonly siteIndexes = new Map<string, Promise<{ sitemap: string[]; llms: string[] }>>();
  /** Pages chosen for reading that no method could read. */
  readonly unreadable = new Map<string, string>();
  /** Extra URL context calls made to read pages a plain fetch couldn't. */
  urlContextRescues = 0;

  private readonly startedAt = Date.now();
  private isOfficial: ((url: string) => boolean) | null = null;
  private usage: UsageTotals = { modelCalls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0, fetches: 0 };

  constructor(private readonly estimateCost: (usage: UsageTotals) => number) {}

  /** From here on, only pages that pass this test count as evidence. */
  restrictTo(isOfficial: (url: string) => boolean) {
    this.isOfficial = isOfficial;
  }

  /** Whether a URL would be accepted as evidence now. */
  accepts(url: string): boolean {
    return this.isOfficial ? this.isOfficial(url) : true;
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
    if (!this.accepts(page.url)) {
      this.rejected.push(page.url);
      return null;
    }
    return this.keep(page);
  }

  /**
   * Records a machine-readable file the provider publishes on its own domain,
   * such as its OpenID discovery file, which isn't a docs page. The caller has
   * already checked the domain.
   */
  addProviderFile(page: FetchedPage): string | null {
    return hostOf(page.url) ? this.keep(page) : null;
  }

  private keep(page: FetchedPage): string | null {
    const isNew = !this.fetched.has(urlKey(page.url));
    if (isNew || page.text) this.fetched.set(urlKey(page.url), page);
    if (page.text) this.unreadable.delete(urlKey(page.url));
    return isNew ? hostOf(page.url) : null;
  }

  /** Claims one extra URL context call, or says the run has used its share. */
  takeUrlContextRescue(): boolean {
    if (this.urlContextRescues >= MAX_URL_CONTEXT_RESCUES) return false;
    this.urlContextRescues += 1;
    return true;
  }

  markUnreadable(url: string) {
    if (!this.fetched.get(urlKey(url))?.text) this.unreadable.set(urlKey(url), url);
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
