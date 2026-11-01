import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { slugify } from "@/lib/agent/evidence";
import { hostOf } from "@/lib/agent/urls";
import { GENERATED_VERSION, type GeneratedResult, isAppCard } from "@/types/guide";

/** Generations allowed per IP. The demo is public, and each one uses real quota. */
export const RATE_LIMIT = { requests: 5, window: "1 h" } as const;

/** A result this new is served instead of generating again, so repeat demos don't use up quota. */
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

/** One key per slug, holding a guide or a result card. A new result replaces the old one. */
const resultKey = (slug: string) => `guide:${slug}`;

/** The two names the Upstash client reads. Which one you get depends on how the store was created on Vercel. */
export function isStoreConfigured(): boolean {
  const { UPSTASH_REDIS_REST_URL, KV_REST_API_URL, UPSTASH_REDIS_REST_TOKEN, KV_REST_API_TOKEN } = process.env;
  return Boolean((UPSTASH_REDIS_REST_URL || KV_REST_API_URL) && (UPSTASH_REDIS_REST_TOKEN || KV_REST_API_TOKEN));
}

let redis: Redis | undefined;

function getRedis(): Redis {
  redis ??= Redis.fromEnv();
  return redis;
}

let limiter: Ratelimit | undefined;

export async function checkRateLimit(ip: string) {
  limiter ??= new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(RATE_LIMIT.requests, RATE_LIMIT.window),
    prefix: "authpath:ratelimit",
  });
  return limiter.limit(ip);
}

export async function saveGeneratedResult(result: GeneratedResult): Promise<void> {
  await getRedis().set(resultKey(result.id), result);
}

export async function getGeneratedResult(slug: string): Promise<GeneratedResult | null> {
  if (!isStoreConfigured()) return null;
  return getRedis().get<GeneratedResult>(resultKey(slug));
}

/** The slugs an input could be saved under: "Linear", "linear.app" and a picked option like "Mercury (mercury.com)". */
function candidateSlugs(input: string): string[] {
  const text = input.trim();
  const name = text.split(" (")[0];
  const host = hostOf(/^https?:\/\//.test(text) ? text : `https://${text.split(/[\s/]/)[0]}`);
  const label = host?.includes(".") ? host.split(".")[0] : "";
  return [...new Set([slugify(text), slugify(name), slugify(label)])].filter(Boolean);
}

/**
 * A result made for this app in the last 7 days by the current pipeline, if there
 * is one. Older shapes are made again, and a guide with nothing confirmed is
 * worth another try rather than 7 days of reuse.
 */
export async function findRecentResult(input: string): Promise<GeneratedResult | null> {
  for (const slug of candidateSlugs(input)) {
    const result = await getGeneratedResult(slug);
    if (!result?.generatedAt || result.version !== GENERATED_VERSION) continue;
    if (Date.now() - Date.parse(result.generatedAt) >= RECENT_MS) continue;
    if (isAppCard(result) || result.steps.some((step) => step.e === "docs")) return result;
  }
  return null;
}
