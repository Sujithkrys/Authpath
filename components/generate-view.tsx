"use client";

import { Check, FileCheck2, RotateCcw, ShieldCheck, Sparkles, Timer } from "lucide-react";
import Link from "next/link";
import type { FormEvent, ReactNode } from "react";

import { CardFacts, CategoryTag, cardHeadline } from "@/components/app-card-view";
import { useAppState, type TraceOutcome, type TraceRun, type TraceStage } from "@/components/app-state";
import { SearchField, buttonPrimary, describeClaimCheck, heroTitle } from "@/components/ui";
import { STAGES } from "@/lib/agent/events";
import { formatGeneratedAt } from "@/lib/format";

/** Already generated on the live site, so a demo click opens instantly. */
const EXAMPLES = ["Linear", "Calendly", "Composio"];

const HIGHLIGHTS = [
  { icon: FileCheck2, text: "Official docs only" },
  { icon: ShieldCheck, text: "Every claim checked" },
  { icon: Timer, text: "Review and wait times" },
];

const STEP_ICON_STYLE: Record<TraceStage["status"], string> = {
  done: "border-accent bg-accent text-on-accent",
  active: "border-accent text-accent",
  waiting: "border-border-strong text-text-3",
};

interface TraceRowProps {
  title: string;
  working: string;
  stage: TraceStage;
  /** The run has finished, so a stage that isn't done will never run. */
  ended: boolean;
}

function stageDetail({ working, stage, ended }: TraceRowProps) {
  if (stage.status === "done") return stage.detail;
  if (stage.status === "active") return ended ? "Stopped" : working;
  return ended ? "Skipped" : "Waiting";
}

function TraceRow(props: TraceRowProps) {
  const { title, stage, ended } = props;
  const waiting = stage.status === "waiting";

  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-3 px-[18px] py-3 max-sm:grid-cols-[28px_minmax(0,1fr)]">
      <span
        className={`mt-px grid size-[22px] place-items-center rounded-full border-[1.5px] ${STEP_ICON_STYLE[stage.status]}`}
      >
        {stage.status === "done" && <Check size={12} strokeWidth={2.4} aria-hidden="true" />}
        {stage.status === "active" && !ended && (
          <span className="size-3 animate-spinner rounded-full border-2 border-accent-soft border-t-accent" />
        )}
      </span>
      <div>
        <div className={`text-[15px] font-semibold ${waiting ? "text-text-3" : ""}`}>{title}</div>
        <div className={`mt-0.5 text-[14px] ${waiting ? "text-text-3" : "text-text-2"}`}>{stageDetail(props)}</div>
      </div>
      {stage.domains.length > 0 && (
        <div className="flex max-w-[260px] flex-wrap justify-end gap-1 max-sm:col-start-2 max-sm:max-w-none max-sm:justify-start">
          {stage.domains.map((domain) => (
            <span
              key={domain}
              className="rounded-sm bg-accent-soft px-[7px] py-0.5 font-mono text-[11.5px] break-all text-accent-ink"
            >
              {domain}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-2 px-[18px] py-3.5">
      {children}
    </div>
  );
}

/** The reader's own time zone. This only renders after a generation, so it can't cause a hydration mismatch. */
const formatResumeTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

const footerText = "min-w-0 text-[14px] text-text-2";

function OutcomePanel({ outcome, run, onRun }: { outcome: TraceOutcome; run: TraceRun; onRun: (input: string) => void }) {
  switch (outcome.kind) {
    case "guide":
      return (
        <Footer>
          <span className={footerText}>
            Guide ready · {outcome.uncertainCount} {outcome.uncertainCount === 1 ? "item" : "items"} marked not confirmed
            {outcome.claimCheck && (outcome.claimCheck.dropped > 0 || outcome.claimCheck.downgraded > 0) && (
              <> · checker: {describeClaimCheck(outcome.claimCheck)}</>
            )}
          </span>
          <Link href={`/guides/${outcome.slug}`} className={buttonPrimary}>
            Open guide
          </Link>
        </Footer>
      );

    case "cached":
      return (
        <Footer>
          <span className={footerText}>Already generated on {formatGeneratedAt(outcome.generatedAt)}</span>
          {/* A cached result can be a guide or a card, and both live at /guides/{slug}. */}
          <Link href={`/guides/${outcome.slug}`} className={buttonPrimary}>
            Open result
          </Link>
        </Footer>
      );

    case "card":
      return (
        <div className="border-t border-border bg-surface-2 px-[18px] py-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <CategoryTag category={outcome.card.category} />
          </div>
          <b className="mb-4 block text-[15px] font-semibold [overflow-wrap:anywhere]">{cardHeadline(outcome.card)}</b>
          <CardFacts card={outcome.card} />
          <div className="mt-4 mb-1 font-mono text-[11px] tracking-[.08em] text-text-3 uppercase">Sources</div>
          <ul className="flex flex-wrap gap-1">
            {outcome.card.sources.map(([title, url]) => (
              <li key={url} className="min-w-0 max-w-full">
                <a
                  href={`https://${url}`}
                  target="_blank"
                  rel="noreferrer"
                  title={`${title} · https://${url}`}
                  className="block max-w-full truncate rounded-sm bg-accent-soft px-[7px] py-0.5 font-mono text-[11.5px] text-accent-ink hover:underline"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end">
            <Link href={`/guides/${outcome.slug}`} className={buttonPrimary}>
              Open shareable page
            </Link>
          </div>
        </div>
      );

    case "paused":
      return (
        <div className="border-t border-border bg-surface-2 px-[18px] py-4">
          <b className="mb-1 block text-[15px] font-semibold">Live generation is paused until {formatResumeTime(outcome.resumesAt)}.</b>
          <p className="text-[14px] text-text-2">
            <Link href="/" className="text-accent-ink hover:underline">
              Library guides
            </Link>{" "}
            and previously generated guides still work.
          </p>
          {outcome.generated.length > 0 && (
            <>
              <div className="mt-4 mb-1.5 font-mono text-[11px] tracking-[.08em] text-text-3 uppercase">Generated guides</div>
              <ul className="flex flex-wrap gap-1.5">
                {outcome.generated.map(({ slug, name }) => (
                  <li key={slug} className="min-w-0 max-w-full">
                    <Link
                      href={`/guides/${slug}`}
                      className="block max-w-full truncate rounded-sm border border-border bg-surface px-2.5 py-1 text-[13.5px] hover:border-border-strong"
                    >
                      {name}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      );

    case "ambiguous":
      return (
        <Footer>
          <div className="w-full">
            <span className={footerText}>That name could mean a few different apps. Which one?</span>
            <div className="mt-2 flex flex-col gap-2">
              {outcome.options.map((option) => (
                <button
                  key={`${option.name}-${option.website}`}
                  type="button"
                  onClick={() => onRun(`${option.name} (${option.website})`)}
                  className="rounded-md border border-border-strong bg-surface px-3 py-2 text-left hover:bg-hover"
                >
                  <b className="block text-[15px] font-semibold">{option.name}</b>
                  <span className="text-[14px] text-text-2">{option.description}</span>
                </button>
              ))}
            </div>
          </div>
        </Footer>
      );

    case "not_found":
      return (
        <Footer>
          <span className={footerText}>{outcome.message}</span>
        </Footer>
      );

    case "error":
      return (
        <Footer>
          <span className={footerText}>{outcome.message}</span>
          {outcome.retryable && (
            <button type="button" onClick={() => onRun(run.input)} className={buttonPrimary}>
              <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
              Retry
            </button>
          )}
        </Footer>
      );
  }
}

function statusLabel(outcome: TraceOutcome | null) {
  if (!outcome) return "Working";
  if (outcome.kind === "error") return "Stopped";
  if (outcome.kind === "ambiguous") return "Needs a choice";
  return "Done";
}

export function GenerateView() {
  const { generateInput, setGenerateInput, trace, startTrace } = useAppState();
  const running = trace !== null && trace.outcome === null;
  const stopped = trace?.outcome?.kind === "error";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTrace(generateInput);
  };

  const run = (input: string) => {
    setGenerateInput(input);
    startTrace(input);
  };

  return (
    <section aria-labelledby="generate-heading">
      <div className="mx-auto mt-9 max-w-[720px] text-center">
        <h1 id="generate-heading" className={`${heroTitle} mb-4 text-[clamp(30px,3.6vw,40px)] leading-[1.12]`}>
          Get an OAuth setup guide for any app
        </h1>
        <p className="mx-auto mb-7 max-w-[520px] text-[16px] text-text-2">Built from the official docs in about a minute.</p>

        <form onSubmit={submit} className="mx-auto flex max-w-[600px] gap-2.5 max-sm:flex-col">
          <SearchField
            label="App name or website"
            iconSize={18}
            placeholder="App name or website, e.g. linear.app"
            required
            maxLength={200}
            value={generateInput}
            onChange={(event) => setGenerateInput(event.target.value)}
            fieldClassName="h-12 flex-1 max-sm:flex-none"
          />
          <button type="submit" disabled={running} className={`${buttonPrimary} h-12 px-[22px] text-[15px] disabled:opacity-60`}>
            <Sparkles size={16} strokeWidth={1.8} aria-hidden="true" />
            Generate
          </button>
        </form>

        <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2 text-[14px] text-text-3">
          Try:
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              disabled={running}
              onClick={() => run(example)}
              className="rounded-full border border-border px-[11px] py-[3px] text-[14px] text-text-2 hover:bg-hover disabled:opacity-60"
            >
              {example}
            </button>
          ))}
        </div>

        {!trace && (
          <ul className="mx-auto mt-12 grid max-w-[600px] grid-cols-3 gap-3 max-sm:grid-cols-1">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center justify-center gap-2 rounded-sm border border-border bg-surface px-3 py-3 text-[13.5px] text-text-2">
                <Icon size={16} strokeWidth={1.8} className="flex-none text-accent" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        )}
      </div>

      {trace && (
        <div className="mx-auto mt-10 max-w-[720px]">
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-border px-[18px] py-3.5">
              <b className="min-w-0 text-[15px] break-words">Investigating {trace.input}</b>
              <span className="flex items-center gap-2 font-mono text-[12px] whitespace-nowrap text-text-2">
                <span
                  className={`size-2 rounded-full ${running ? "animate-live bg-accent" : stopped ? "bg-bad" : "bg-ok"}`}
                />
                <span role="status">{statusLabel(trace.outcome)}</span>
              </span>
            </div>

            <ol className="py-2">
              {STAGES.map(({ id, title, working }) => (
                <TraceRow key={id} title={title} working={working} stage={trace.stages[id]} ended={!running} />
              ))}
            </ol>

            {trace.outcome && <OutcomePanel outcome={trace.outcome} run={trace} onRun={run} />}
          </div>
        </div>
      )}
    </section>
  );
}
