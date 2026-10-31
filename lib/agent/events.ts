/** The stream contract between /api/generate and the trace UI. Safe to import on the client. */

import type { Guide } from "@/types/guide";

export const STAGES = [
  {
    id: "find",
    title: "Finding the developer docs",
    working: "Searching for official developer and OAuth docs",
  },
  {
    id: "read",
    title: "Reading OAuth app registration",
    working: "Reading the provider's own pages",
  },
  {
    id: "approval",
    title: "Checking for a review or approval step",
    working: "Looking for review, verification and published timelines",
  },
  {
    id: "write",
    title: "Writing the guide",
    working: "Checking every step against the pages that were read",
  },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export interface AppOption {
  name: string;
  description: string;
  website: string;
}

export interface GenerationStats {
  durationMs: number;
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  webSearches: number;
  webFetches: number;
  estimatedCostUsd: number;
}

export type GenerateEvent =
  | { type: "stage_start"; stage: StageId }
  | { type: "sources"; stage: StageId; domains: string[] }
  | { type: "stage_done"; stage: StageId; detail: string }
  /** The app is already in the library. */
  | { type: "redirect"; slug: string }
  /** A guide from the last 7 days, served instead of generating again. */
  | { type: "cached"; slug: string; generatedAt: string }
  | { type: "guide"; slug: string; uncertainCount: number; guide: Guide; stats: GenerationStats }
  | { type: "no_oauth"; appName: string; summary: string; authMethods: string[]; sources: string[]; stats: GenerationStats }
  | { type: "ambiguous"; options: AppOption[]; stats: GenerationStats }
  | { type: "not_found"; message: string; stats: GenerationStats }
  | { type: "error"; message: string; retryable: boolean; detail?: string };
