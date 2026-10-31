import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import type { Guide } from "@/types/guide";

/** Generations allowed per IP. The demo is public, and each one costs real API credits. */
export const RATE_LIMIT = { requests: 5, window: "1 h" } as const;

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
