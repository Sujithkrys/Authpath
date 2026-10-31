export type Difficulty = "easy" | "moderate" | "hard";
export type WaitKey = "none" | "days" | "weeks";
export type StepOwner = "you" | "agent";
export type Evidence = "verified" | "docs" | "uncertain";

export interface GuideStep {
  /** Title. */
  t: string;
  /** Description. May contain inline <code> tags, and no other markup. */
  d: string;
  /** Who does the step. */
  o: StepOwner;
  /** How we know the step is right. "verified" is only ever set by hand, on library guides. */
  e: Evidence;
  /** The page this step rests on. Generated guides only. */
  source?: string;
}

export interface GuideBlocker {
  /** Title. */
  b: string;
  /** Explanation. */
  s: string;
  /** The page this blocker rests on. Generated guides only. */
  source?: string;
}

/** [title, url without protocol] */
export type GuideSource = [title: string, url: string];

export interface Guide {
  /** Also the URL slug: /guides/[id]. */
  id: string;
  name: string;
  /** Letters for the fallback tile. */
  init: string;
  /** Background of the letter tile. */
  color: string;
  diff: Difficulty;
  tested: boolean;
  /** True for the agent's output. These stay out of the library. */
  generated?: boolean;
  /** ISO timestamp. Generated guides only. */
  generatedAt?: string;
  setup: string;
  wait: string;
  review: string;
  /** Approval-wait filter bucket. Generated guides don't have one. */
  waitKey?: WaitKey;
  /** Developer console, without protocol. */
  site: string;
  steps: GuideStep[];
  blockers: GuideBlocker[];
  agent: string[];
  you: string[];
  sources: GuideSource[];
}

/** A guide plus its logo file, or null when it uses the letter tile. */
export interface GuideWithLogo extends Guide {
  logoSrc: string | null;
}
