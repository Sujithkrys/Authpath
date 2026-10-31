import { anthropicProvider } from "@/lib/llm/anthropic";
import { geminiProvider } from "@/lib/llm/gemini";
import type { LlmProvider } from "@/lib/llm/types";

/** Chosen by LLM_PROVIDER. Defaults to Gemini, and changing the env var is the whole switch. */
export function getProvider(): LlmProvider {
  return process.env.LLM_PROVIDER === "anthropic" ? anthropicProvider : geminiProvider;
}
