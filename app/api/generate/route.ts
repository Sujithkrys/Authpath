import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import { z } from "zod";

import type { GenerateEvent } from "@/lib/agent/events";
import { runPipeline } from "@/lib/agent/pipeline";
import { AgentError } from "@/lib/agent/run-stage";
import { findLibraryGuide } from "@/lib/guides";
import { RATE_LIMIT, checkRateLimit, isStoreConfigured } from "@/lib/store";

// 300s is the most Vercel's Hobby plan allows, and also the default on Pro, so
// this is safe on either. The agent stops first so it can still report back.
export const maxDuration = 300;
const OVERALL_TIMEOUT_MS = 270_000;

const Body = z.object({ input: z.string().trim().min(1).max(200) });

const line = (event: GenerateEvent) => `${JSON.stringify(event)}\n`;

function refuse(event: GenerateEvent, status: number) {
  return new Response(line(event), { status, headers: { "Content-Type": "application/x-ndjson" } });
}

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function toErrorEvent(error: unknown, timedOut: boolean): GenerateEvent {
  if (timedOut) {
    return { type: "error", message: "This took too long and was stopped. Please try again.", retryable: true };
  }
  if (error instanceof AgentError) {
    return { type: "error", message: error.message, retryable: error.retryable };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { type: "error", message: "The research service is busy. Try again in a minute.", retryable: true };
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return { type: "error", message: "The generator isn't set up correctly.", retryable: false };
  }
  return { type: "error", message: "Something went wrong while researching this app.", retryable: true };
}

export async function POST(request: NextRequest) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return refuse({ type: "error", message: "Enter an app name or website.", retryable: false }, 400);
  }
  const { input } = body.data;

  // Checked first: an app we already have costs nothing and counts against no one.
  const inLibrary = findLibraryGuide(input);
  if (inLibrary) return refuse({ type: "redirect", slug: inLibrary.id }, 200);

  if (!process.env.ANTHROPIC_API_KEY || !isStoreConfigured()) {
    return refuse({ type: "error", message: "The generator isn't set up yet.", retryable: false }, 503);
  }

  // Fails closed: if the limit can't be checked, nothing runs on the API key.
  const limit = await checkRateLimit(clientIp(request)).catch((error: unknown) => {
    console.error("rate limit check failed", error);
    return null;
  });
  if (!limit) {
    return refuse({ type: "error", message: "Something went wrong. Please try again.", retryable: true }, 503);
  }
  if (!limit.success) {
    const minutes = Math.max(1, Math.ceil((limit.reset - Date.now()) / 60_000));
    return refuse(
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
        await runPipeline(input, emit, signal);
      } catch (error) {
        console.error("generation failed", error);
        emit(toErrorEvent(error, timeout.aborted));
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
