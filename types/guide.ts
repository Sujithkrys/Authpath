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
  /** How we know the step is right. */
  e: Evidence;
}

export interface GuideBlocker {
  /** Title. */
  b: string;
  /** Explanation. */
  s: string;
}

/** [title, url without protocol] */
export type GuideSource = [title: string, url: string];

export interface Guide {
  /** Also the URL slug: /guides/[id]. */
  id: string;
  name: string;
  /** Letters for the fallback tile. */
  init: string;
  /** Brand colour for the logo tile. */
  color: string;
  diff: Difficulty;
  tested: boolean;
  /** True for the agent's output. These stay out of the library. */
  generated?: boolean;
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

/** A guide plus its simple-icons path, or null when it uses the letter tile. */
export interface GuideWithLogo extends Guide {
  logoPath: string | null;
}
