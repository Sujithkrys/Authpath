"use client";

import { Check, Sparkles } from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";

import { useAppState } from "@/components/app-state";
import { SearchField, buttonPrimary, heroTitle } from "@/components/ui";
import { FAKE_TRACE, FAKE_TRACE_RESULT_SLUG, type TraceStep } from "@/lib/fake-trace";

const EXAMPLES = ["linear.app", "Calendly", "Xero"];

type StepState = "done" | "active" | "waiting";

const STEP_ICON_STYLE: Record<StepState, string> = {
  done: "border-accent bg-accent text-on-accent",
  active: "border-accent text-accent",
  waiting: "border-border-strong text-text-3",
};

function TraceRow({ step, state }: { step: TraceStep; state: StepState }) {
  const waiting = state === "waiting";

  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-3 px-[18px] py-3 max-sm:grid-cols-[28px_minmax(0,1fr)]">
      <span className={`mt-px grid size-[22px] place-items-center rounded-full border-[1.5px] ${STEP_ICON_STYLE[state]}`}>
        {state === "done" && <Check size={12} strokeWidth={2.4} aria-hidden="true" />}
        {state === "active" && (
          <span className="size-3 animate-spinner rounded-full border-2 border-accent-soft border-t-accent" />
        )}
      </span>
      <div>
        <div className={`text-[14px] font-semibold ${waiting ? "text-text-3" : ""}`}>{step.title}</div>
        <div className={`mt-0.5 text-[13px] ${waiting ? "text-text-3" : "text-text-2"}`}>
          {waiting ? "Waiting" : step.detail}
        </div>
      </div>
      {step.source && state === "done" && (
        <span className="rounded-sm bg-accent-soft px-[7px] py-0.5 font-mono text-[11.5px] whitespace-nowrap text-accent-ink max-sm:col-start-2 max-sm:justify-self-start">
          {step.source}
        </span>
      )}
    </li>
  );
}

export function GenerateView() {
  const { generateInput, setGenerateInput, trace, startTrace } = useAppState();
  const finished = trace !== null && trace.step >= FAKE_TRACE.length;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    startTrace(generateInput);
  };

  const runExample = (example: string) => {
    setGenerateInput(example);
    startTrace(example);
  };

  return (
    <section aria-labelledby="generate-heading">
      <div className="mx-auto mt-9 max-w-[720px] text-center">
        <h1 id="generate-heading" className={`${heroTitle} mb-3.5 text-[clamp(32px,4.6vw,48px)] leading-[1.06]`}>
          Get a setup guide for any app, in about a minute.
        </h1>
        <p className="mx-auto mb-7 max-w-[520px] text-[16px] text-text-2">
          An agent reads the provider&apos;s developer docs, works out what approval involves, and tells you what it
          couldn&apos;t confirm.
        </p>

        <form onSubmit={submit} className="mx-auto flex max-w-[600px] gap-2.5 max-sm:flex-col">
          <SearchField
            label="App name or website"
            iconSize={18}
            placeholder="App name or website, e.g. linear.app"
            required
            value={generateInput}
            onChange={(event) => setGenerateInput(event.target.value)}
            fieldClassName="h-12 flex-1 max-sm:flex-none"
          />
          <button type="submit" className={`${buttonPrimary} h-12 px-[22px] text-[15px]`}>
            <Sparkles size={16} strokeWidth={1.8} aria-hidden="true" />
            Generate
          </button>
        </form>

        <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2 text-[13px] text-text-3">
          Try:
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => runExample(example)}
              className="rounded-full border border-border px-[11px] py-[3px] text-[13px] text-text-2 hover:bg-hover"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {trace && (
        <div className="mx-auto mt-10 max-w-[720px]">
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-border px-[18px] py-3.5">
              <b className="min-w-0 text-[15px] break-words">Investigating {trace.name}</b>
              <span className="flex items-center gap-2 font-mono text-[12px] text-text-2">
                <span className={`size-2 rounded-full ${finished ? "bg-ok" : "animate-live bg-accent"}`} />
                <span role="status">{finished ? "Done" : "Working"}</span>
              </span>
            </div>

            <ol className="py-2">
              {FAKE_TRACE.map((step, index) => (
                <TraceRow
                  key={step.title}
                  step={step}
                  state={index < trace.step ? "done" : index === trace.step ? "active" : "waiting"}
                />
              ))}
            </ol>

            {finished && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-2 px-[18px] py-3.5">
                <span className="text-[13px] text-text-2">Guide ready · 2 items marked not confirmed</span>
                <Link href={`/guides/${FAKE_TRACE_RESULT_SLUG}`} className={buttonPrimary}>
                  Open guide
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
