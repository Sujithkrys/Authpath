"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { STAGES, type AppOption, type GenerateEvent, type StageId } from "@/lib/agent/events";
import type { AppCard, ClaimCheck, Difficulty, WaitKey } from "@/types/guide";

export type DifficultyFilter = "all" | Difficulty;
export type WaitFilter = "all" | WaitKey;

export interface TraceStage {
  status: "waiting" | "active" | "done";
  detail?: string;
  domains: string[];
}

export type TraceOutcome =
  | { kind: "guide"; slug: string; uncertainCount: number; claimCheck?: ClaimCheck }
  | { kind: "cached"; slug: string; generatedAt: string }
  | { kind: "card"; slug: string; card: AppCard }
  | { kind: "ambiguous"; options: AppOption[] }
  | { kind: "not_found"; message: string }
  | { kind: "error"; message: string; retryable: boolean };

export interface TraceRun {
  input: string;
  stages: Record<StageId, TraceStage>;
  outcome: TraceOutcome | null;
}

interface AppState {
  difficulty: DifficultyFilter;
  setDifficulty: (value: DifficultyFilter) => void;
  wait: WaitFilter;
  setWait: (value: WaitFilter) => void;
  query: string;
  setQuery: (value: string) => void;
  generateInput: string;
  setGenerateInput: (value: string) => void;
  trace: TraceRun | null;
  startTrace: (input: string) => void;
}

const AppStateContext = createContext<AppState | null>(null);

const newStages = () =>
  Object.fromEntries(STAGES.map(({ id }) => [id, { status: "waiting", domains: [] }])) as unknown as Record<
    StageId,
    TraceStage
  >;

const LOST_CONNECTION = "The connection dropped before the guide was finished.";

function applyEvent(run: TraceRun, event: GenerateEvent): TraceRun {
  const updateStage = (stage: StageId, change: Partial<TraceStage>) => ({
    ...run,
    stages: { ...run.stages, [stage]: { ...run.stages[stage], ...change } },
  });

  switch (event.type) {
    case "stage_start":
      return updateStage(event.stage, { status: "active" });
    case "sources":
      return updateStage(event.stage, {
        domains: [...new Set([...run.stages[event.stage].domains, ...event.domains])],
      });
    case "stage_done":
      return updateStage(event.stage, { status: "done", detail: event.detail });
    case "guide":
      return {
        ...run,
        outcome: { kind: "guide", slug: event.slug, uncertainCount: event.uncertainCount, claimCheck: event.claimCheck },
      };
    case "cached":
      return { ...run, outcome: { kind: "cached", slug: event.slug, generatedAt: event.generatedAt } };
    case "card":
      return { ...run, outcome: { kind: "card", slug: event.slug, card: event.card } };
    case "ambiguous":
      return { ...run, outcome: { kind: "ambiguous", options: event.options } };
    case "not_found":
      return { ...run, outcome: { kind: "not_found", message: event.message } };
    case "error":
      return { ...run, outcome: { kind: "error", message: event.message, retryable: event.retryable } };
    case "redirect":
      return run;
  }
}

/**
 * The mockup is one page, so its filters and trace survive moving between
 * views. Holding them here, above the routes, keeps that behaviour, and lets a
 * generation keep running while you read something else.
 */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [wait, setWait] = useState<WaitFilter>("all");
  const [query, setQuery] = useState("");
  const [generateInput, setGenerateInput] = useState("");
  const [trace, setTrace] = useState<TraceRun | null>(null);
  const current = useRef<AbortController | null>(null);

  const value = useMemo<AppState>(() => {
    const startTrace = async (rawInput: string) => {
      current.current?.abort();
      const controller = new AbortController();
      current.current = controller;

      const input = rawInput.trim();
      setTrace({ input, stages: newStages(), outcome: null });

      const fail = (message: string) =>
        setTrace((run) => run && { ...run, outcome: run.outcome ?? { kind: "error", message, retryable: true } });

      const handle = (event: GenerateEvent) => {
        if (event.type === "redirect") {
          setTrace(null);
          router.push(`/guides/${event.slug}`);
          return;
        }
        setTrace((run) => run && applyEvent(run, event));
      };

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input }),
          signal: controller.signal,
        });
        if (!response.body) throw new Error("No response body");

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        let finished = false;

        while (!finished) {
          const { done, value: chunk } = await reader.read();
          finished = done;
          buffer += chunk ?? "";

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          lines.filter(Boolean).forEach((text) => handle(JSON.parse(text) as GenerateEvent));
        }

        // A stream that ends with no result was cut off, e.g. by the platform's time limit.
        fail(LOST_CONNECTION);
      } catch {
        if (!controller.signal.aborted) fail(LOST_CONNECTION);
      }
    };

    return {
      difficulty,
      setDifficulty,
      wait,
      setWait,
      query,
      setQuery,
      generateInput,
      setGenerateInput,
      trace,
      startTrace,
    };
  }, [difficulty, wait, query, generateInput, trace, router]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const state = useContext(AppStateContext);
  if (!state) throw new Error("useAppState must be used inside AppStateProvider");
  return state;
}
