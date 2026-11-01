import type { NextRequest } from "next/server";
import { z } from "zod";

import type { GenerateEvent } from "@/lib/agent/events";
import { runPipeline } from "@/lib/agent/pipeline";
import { findLibraryGuide } from "@/lib/guides";
import { getProvider } from "@/lib/llm";
import { nextPacificMidnight } from "@/lib/format";
import { AgentError, QuotaExhausted } from "@/lib/llm/types";
import { RATE_LIMIT, checkRateLimit, findRecentResult, isStoreConfigured, listGeneratedResults } from "@/lib/store";

// 300s is the most Vercel's Hobby plan allows, and also the default on Pro, so
// this is safe on either. The agent stops first so it can still report back.
export const maxDuration = 300;
const OVERALL_TIMEOUT_MS = 270_000;

const Body = z.object({ input: z.string().trim().min(1).max(200), compare: z.boolean().optional() });

/**
 * Compare mode generates even for library apps, so the agent can be checked
 * against guides verified by hand. It skips the library redirect, the cache,
 * the rate limit and saving, so it only works in local development with
 * AUTHPATH_COMPARE=true, and never in production.
 */
const compareAllowed = () => process.env.NODE_ENV !== "production" && process.env.AUTHPATH_COMPARE === "true";

const line = (event: GenerateEvent) => `${JSON.stringify(event)}\n`;

function reply(event: GenerateEvent, status: number) {
  return new Response(line(event), { status, headers: { "Content-Type": "application/x-ndjson" } });
}

const notSetUp = (missing: string) =>
  reply({ type: "error", message: `The generator isn't set up yet: ${missing}.`, retryable: false }, 503);

/** Names a storage setup mistake, which no amount of retrying will fix. */
function describeStorageFault(error: unknown): string | null {
  const text = String(error);
  if (/NOPERM|READONLY|read.?only/i.test(text)) return "guide storage has a read-only token";
  if (/WRONGPASS|NOAUTH|unauthorized|\b401\b/i.test(text)) return "guide storage rejected its token";
  if (/ENOTFOUND|getaddrinfo|fetch failed|invalid url/i.test(text)) return "guide storage's address can't be reached";
  return null;
}

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function toErrorEvent(error: unknown, timedOut: boolean): GenerateEvent {
  if (timedOut) {
    return { type: "error", message: "This took too long and was stopped. Please try again.", retryable: true };
  }
  if (error instanceof AgentError) {
    return { type: "error", message: error.message, retryable: error.retryable, detail: error.detail };
  }
  return { type: "error", message: "Something went wrong while researching this app.", retryable: true };
}

export async function POST(request: NextRequest) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return reply({ type: "error", message: "Enter an app name or website.", retryable: false }, 400);
  }
  const { input } = body.data;
  const compare = body.data.compare === true && compareAllowed();

  if (!compare) {
    // These two are free, so they come before the rate limit and any model call.
    const inLibrary = findLibraryGuide(input);
    if (inLibrary) return reply({ type: "redirect", slug: inLibrary.id }, 200);

    if (!isStoreConfigured()) return notSetUp("guide storage isn't connected");

    const recent = await findRecentResult(input).catch((error: unknown) => {
      console.error("recent result lookup failed", error);
      return null;
    });
    if (recent) return reply({ type: "cached", slug: recent.id, generatedAt: recent.generatedAt! }, 200);
  }

  if (!getProvider().isConfigured()) return notSetUp(`no API key for ${getProvider().name}`);

  // Fails closed: if the limit can't be checked, nothing runs on the API key.
  let storageFault: string | null = null;
  const limit = compare
    ? { success: true, reset: 0 }
    : await checkRateLimit(clientIp(request)).catch((error: unknown) => {
        console.error("rate limit check failed", error);
        storageFault = describeStorageFault(error);
        return null;
      });
  if (storageFault) return notSetUp(storageFault);
  if (!limit) {
    return reply({ type: "error", message: "Something went wrong. Please try again.", retryable: true }, 503);
  }
  if (!limit.success) {
    const minutes = Math.max(1, Math.ceil((limit.reset - Date.now()) / 60_000));
    return reply(
      {
        type: "error",
        message: `You've reached the limit of ${RATE_LIMIT.requests} guides an hour. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
        retryable: false,
      },
      429,
    );
  }

  const timeout = AbortSignal.timeout(OVERALL_TIMEOUT_MS);
  const signal = AbortSignal.any([timeout, request.signal]);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: GenerateEvent) => {
        if (!request.signal.aborted) controller.enqueue(encoder.encode(line(event)));
      };

      try {
        await runPipeline(input, emit, signal, { compare });
      } catch (error) {
        console.error("generation failed", error);
        if (error instanceof QuotaExhausted) {
          emit({ type: "paused", resumesAt: nextPacificMidnight(new Date()), generated: await listGeneratedResults(), detail: error.detail });
        } else {
          emit(toErrorEvent(error, timeout.aborted));
        }
      } finally {
        if (!request.signal.aborted) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
