import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { hostOf, slugify } from "@/lib/agent/evidence";
import type { Guide } from "@/types/guide";

/** Generations allowed per IP. The demo is public, and each one uses real quota. */
export const RATE_LIMIT = { requests: 5, window: "1 h" } as const;

/** A guide this new is served instead of generating again, so repeat demos don't use up quota. */
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

const guideKey = (slug: string) => `guide:${slug}`;

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

export async function saveGeneratedGuide(guide: Guide): Promise<void> {
  await getRedis().set(guideKey(guide.id), guide);
}

export async function getGeneratedGuide(slug: string): Promise<Guide | null> {
  if (!isStoreConfigured()) return null;
  return getRedis().get<Guide>(guideKey(slug));
}

/** The slugs an input could be saved under: "Linear", "linear.app" and a picked option like "Mercury (mercury.com)". */
function candidateSlugs(input: string): string[] {
  const text = input.trim();
  const name = text.split(" (")[0];
  const host = hostOf(/^https?:\/\//.test(text) ? text : `https://${text.split(/[\s/]/)[0]}`);
  const label = host?.includes(".") ? host.split(".")[0] : "";
  return [...new Set([slugify(text), slugify(name), slugify(label)])].filter(Boolean);
}

/** A guide already generated for this app in the last 7 days, if there is one. */
export async function findRecentGuide(input: string): Promise<Guide | null> {
  for (const slug of candidateSlugs(input)) {
    const guide = await getGeneratedGuide(slug);
    if (guide?.generatedAt && Date.now() - Date.parse(guide.generatedAt) < RECENT_MS) return guide;
  }
  return null;
}
