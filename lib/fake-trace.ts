export interface TraceStep {
  title: string;
  detail: string;
  /** Source chip shown once the step is done. */
  source?: string;
}

/** Placeholder until the real agent is connected. */
export const FAKE_TRACE: TraceStep[] = [
  {
    title: "Finding the developer docs",
    detail: "Skipped 2 marketing pages, matched the API docs",
    source: "developers.linear.app",
  },
  {
    title: "Reading OAuth app registration",
    detail: "Redirect URI, scopes, and where to create the app",
    source: "docs/oauth",
  },
  { title: "Checking for a review or approval step", detail: "No public review process documented" },
  { title: "Writing the guide", detail: "Marking 2 claims as not confirmed" },
];

export const FAKE_TRACE_STEP_MS = 900;

/** The guide "Open guide" lands on, whatever app was typed in. */
export const FAKE_TRACE_RESULT_SLUG = "linear";
