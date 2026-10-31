"use client";

import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { FAKE_TRACE, FAKE_TRACE_STEP_MS } from "@/lib/fake-trace";
import type { Difficulty, WaitKey } from "@/types/guide";

export type DifficultyFilter = "all" | Difficulty;
export type WaitFilter = "all" | WaitKey;

export interface TraceRun {
  name: string;
  /** Index of the active step. Equals FAKE_TRACE.length when finished. */
  step: number;
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

/**
 * The mockup is one page, so its filters and trace survive moving between
 * views. Holding them here, above the routes, keeps that behaviour: both are
 * still there when you come back from a guide.
 */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [wait, setWait] = useState<WaitFilter>("all");
  const [query, setQuery] = useState("");
  const [generateInput, setGenerateInput] = useState("");
  const [trace, setTrace] = useState<TraceRun | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const value = useMemo<AppState>(() => {
    const startTrace = (input: string) => {
      clearTimeout(timer.current);
      const name = input.trim() || "linear.app";
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const delay = reduceMotion ? 0 : FAKE_TRACE_STEP_MS;

      const advanceTo = (step: number) => {
        timer.current = setTimeout(() => {
          setTrace({ name, step });
          if (step < FAKE_TRACE.length) advanceTo(step + 1);
        }, delay);
      };

      setTrace({ name, step: 0 });
      advanceTo(1);
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
  }, [difficulty, wait, query, generateInput, trace]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const state = useContext(AppStateContext);
  if (!state) throw new Error("useAppState must be used inside AppStateProvider");
  return state;
}
