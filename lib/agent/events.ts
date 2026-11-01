/** The stream contract between /api/generate and the trace UI. Safe to import on the client. */

import type { AppCard, ClaimCheck, Guide } from "@/types/guide";

export const STAGES = [
  {
    id: "classify",
    title: "Identifying the app",
    working: "Finding its official docs and working out what kind of app it is",
  },
  {
    id: "read",
    title: "Researching the setup checklist",
    working: "Reading the provider's own pages for each checklist item",
  },
  {
    id: "approval",
    title: "Checking for a review or approval step",
    working: "Looking for review, verification and published timelines",
  },
  {
    id: "write",
    title: "Writing the guide",
    working: "Turning the checklist answers into short steps",
  },
  {
    id: "verify",
    title: "Checking every claim",
    working: "Comparing each claim with the page it cites",
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
  /** `findings` is for debugging a run. The page doesn't show it. */
  | { type: "stage_done"; stage: StageId; detail: string; findings?: unknown }
  /** The app is already in the library. */
  | { type: "redirect"; slug: string }
  /** A guide or card from the last 7 days, served instead of generating again. */
  | { type: "cached"; slug: string; generatedAt: string }
  | { type: "guide"; slug: string; uncertainCount: number; claimCheck: ClaimCheck; guide: Guide; stats: GenerationStats }
  /** Not an OAuth provider (no_oauth, platform or unknown): a short result card instead of a guide. */
  | { type: "card"; slug: string; card: AppCard; stats: GenerationStats }
  | { type: "ambiguous"; options: AppOption[]; stats: GenerationStats }
  | { type: "not_found"; message: string; stats: GenerationStats }
  | { type: "error"; message: string; retryable: boolean; detail?: string };
