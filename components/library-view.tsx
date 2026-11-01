"use client";

import { ChevronUp, Clock, ExternalLink, Plus, RotateCw, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { useAppState, type DifficultyFilter, type WaitFilter } from "@/components/app-state";
import { AppLogo, DifficultyTag, SearchField, buttonPrimary, panel, panelHeader, pill, rail } from "@/components/ui";
import type { GuideWithLogo } from "@/types/guide";

const DIFFICULTY_TABS: { key: DifficultyFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "easy", label: "Easy" },
  { key: "moderate", label: "Moderate" },
  { key: "hard", label: "Hard" },
];

const WAIT_ROWS: { key: WaitFilter; label: string }[] = [
  { key: "all", label: "Any wait" },
  { key: "none", label: "No approval" },
  { key: "days", label: "A few days" },
  { key: "weeks", label: "Weeks" },
];

/**
 * Sized from the Composio app directory: a 71px-tall box, a bare 36px logo 12px
 * from the edge, a 15.5px name, a 12px grey detail line and a small corner mark.
 */
function GuideCard({ guide }: { guide: GuideWithLogo }) {
  return (
    <Link
      href={`/guides/${guide.id}`}
      aria-label={`Open ${guide.name} guide`}
      className="relative flex w-full items-center gap-3 rounded-sm border border-border bg-surface px-3 pt-3 pb-[11px] text-left transition-colors duration-150 hover:border-border-strong"
    >
      <AppLogo guide={guide} framed={false} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 pr-[70px] text-[15.5px] leading-[22px]">
          {guide.name}
          {guide.tested && <ShieldCheck size={14} strokeWidth={1.8} className="text-accent" aria-hidden="true" />}
        </span>
        <span className="mt-2 flex items-center gap-1 text-[12px] leading-4 text-text-2">
          <Clock size={14} strokeWidth={1.6} aria-hidden="true" />
          <span>
            {guide.setup} · {guide.wait === "None" ? "No approval" : `${guide.wait} wait`}
          </span>
        </span>
      </span>
      <DifficultyTag diff={guide.diff} className="absolute top-3 right-3" />
    </Link>
  );
}

function GuideGrid({ guides }: { guides: GuideWithLogo[] }) {
  return (
    <div className="mb-10 grid grid-cols-3 gap-3 max-xl:grid-cols-2 max-sm:grid-cols-1">
      {guides.map((guide) => (
        <GuideCard key={guide.id} guide={guide} />
      ))}
    </div>
  );
}

const sectionHeading = "text-[17.5px] leading-[26px] font-semibold tracking-[-.01em]";

export function LibraryView({ guides }: { guides: GuideWithLogo[] }) {
  const { difficulty, setDifficulty, wait, setWait, query, setQuery } = useAppState();

  const needle = query.trim().toLowerCase();
  const matches = guides.filter(
    (guide) =>
      (difficulty === "all" || guide.diff === difficulty) &&
      (wait === "all" || guide.waitKey === wait) &&
      guide.name.toLowerCase().includes(needle),
  );
  const tested = matches.filter((guide) => guide.tested);
  const fromDocs = matches.filter((guide) => !guide.tested);

  const filtered = difficulty !== "all" || wait !== "all" || needle !== "";
  const resetFilters = () => {
    setDifficulty("all");
    setWait("all");
    setQuery("");
  };

  const difficultyCount = (key: DifficultyFilter) =>
    key === "all" ? guides.length : guides.filter((guide) => guide.diff === key).length;
  const waitCount = (key: WaitFilter) =>
    key === "all" ? guides.length : guides.filter((guide) => guide.waitKey === key).length;

  return (
    <section aria-labelledby="library-heading">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div
          role="group"
          aria-label="Filter by difficulty"
          className="inline-flex h-9 gap-0.5 rounded-md bg-surface-2 p-[3px] max-sm:flex max-sm:w-full"
        >
          {DIFFICULTY_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={difficulty === key}
              onClick={() => setDifficulty(key)}
              className="group flex h-full items-center justify-center gap-1.5 rounded-sm px-2.5 text-[13.5px] text-text-2 aria-pressed:bg-surface aria-pressed:font-medium aria-pressed:text-text aria-pressed:shadow-[0_1px_2px_rgba(0,0,0,.12)] max-sm:flex-1 max-sm:px-1.5"
            >
              {label}
              <span className="rounded-full bg-hover px-1.5 font-mono text-[11px] leading-[18px] text-text-2 group-aria-pressed:text-text">
                {difficultyCount(key)}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 max-sm:w-full">
          <SearchField
            label="Search apps"
            type="search"
            placeholder="Search apps"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            fieldClassName="h-9 w-64 max-w-full max-sm:w-full"
          />
          <Link href="/generate" className={buttonPrimary}>
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            Generate guide
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_256px] items-start gap-8 max-lg:grid-cols-1">
        <div>
          <div className="mb-9 flex items-baseline gap-2.5">
            <h1 id="library-heading" className="text-[18px] leading-6 font-semibold tracking-[-.01em]">
              Library
            </h1>
            <span className="text-[13px] text-text-2" aria-live="polite">
              {matches.length} {matches.length === 1 ? "guide" : "guides"}
            </span>
          </div>

          {tested.length > 0 && (
            <>
              <div className="mb-3.5 flex items-center gap-2.5">
                <h2 className={sectionHeading}>Tested hands-on</h2>
                <span className={pill}>Verified</span>
              </div>
              <GuideGrid guides={tested} />
            </>
          )}

          {fromDocs.length > 0 && (
            <>
              <div className="mb-3.5 flex items-center gap-2.5">
                <h2 className={sectionHeading}>From provider docs</h2>
              </div>
              <GuideGrid guides={fromDocs} />
            </>
          )}

          {matches.length === 0 && (
            <div className="mb-10 rounded-md border border-dashed border-border-strong p-7 text-center text-text-2">
              No match in the library. <b className="text-text">Generate a guide</b>
              {needle ? ` for "${needle}" instead.` : " instead."}
            </div>
          )}
        </div>

        <div className={rail}>
          <div className={panel}>
            <div className={panelHeader}>
              Approval wait
              <span className="flex items-center gap-1 text-text">
                <ChevronUp size={16} aria-hidden="true" />
                <button
                  type="button"
                  onClick={resetFilters}
                  disabled={!filtered}
                  aria-label="Reset filters"
                  title="Reset filters"
                  className="grid size-7 place-items-center rounded-md hover:bg-hover hover:text-text disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <RotateCw size={15} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </span>
            </div>
            <div className="flex flex-col gap-1 p-3">
              {WAIT_ROWS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={wait === key}
                  onClick={() => setWait(key)}
                  className="flex h-9 w-full items-center justify-between rounded-md px-3 text-left text-[13.5px] text-text-2 hover:bg-surface-2 aria-pressed:bg-surface-2 aria-pressed:font-medium aria-pressed:text-text"
                >
                  <span>{label}</span>
                  <span className="font-mono text-[12px] font-normal">{waitCount(key)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={panel}>
            <Link
              href="/generate"
              className="flex h-10 w-full items-center justify-between gap-2 rounded-lg px-3.5 text-[13.5px] font-medium hover:bg-hover"
            >
              Generate a guide
              <ExternalLink size={15} strokeWidth={1.7} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
