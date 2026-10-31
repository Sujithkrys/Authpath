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

/** Flat, compact cards like the Composio app directory: name, one detail line, a tag in the corner. */
function GuideCard({ guide }: { guide: GuideWithLogo }) {
  return (
    <Link
      href={`/guides/${guide.id}`}
      aria-label={`Open ${guide.name} guide`}
      className="relative flex w-full items-center gap-3 rounded-sm border border-border bg-surface px-4 py-[15px] text-left transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-card"
    >
      <AppLogo guide={guide} framed={false} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 pr-[76px] text-[16px] leading-6 font-medium">
          {guide.name}
          {guide.tested && <ShieldCheck size={15} strokeWidth={1.8} className="text-accent" aria-hidden="true" />}
        </span>
        <span className="mt-0.5 flex items-start gap-1.5 text-[13px] leading-5 text-text-2">
          <Clock size={13} strokeWidth={1.8} className="mt-[3.5px]" aria-hidden="true" />
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

const sectionHeading = "text-[20px] font-semibold tracking-[-.015em]";

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
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div
          role="group"
          aria-label="Filter by difficulty"
          className="inline-flex gap-0.5 rounded-md bg-surface-2 p-[3px] max-sm:flex max-sm:w-full max-sm:flex-wrap"
        >
          {DIFFICULTY_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={difficulty === key}
              onClick={() => setDifficulty(key)}
              className="group flex items-center justify-center gap-[7px] rounded-sm px-3 py-1.5 text-[15px] text-text-2 aria-pressed:bg-surface aria-pressed:font-semibold aria-pressed:text-text aria-pressed:shadow-card max-sm:flex-1 max-sm:px-2"
            >
              {label}
              <span className="rounded-full border border-border bg-surface-2 px-1.5 font-mono text-[11px] text-text-2 group-aria-pressed:bg-hover">
                {difficultyCount(key)}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 max-sm:w-full">
          <SearchField
            label="Search apps"
            type="search"
            placeholder="Search apps"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            fieldClassName="h-10 w-[320px] max-w-full max-sm:w-full"
          />
          <Link href="/generate" className={buttonPrimary}>
            <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
            Generate guide
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-8 max-lg:grid-cols-1">
        <div>
          <div className="mb-7 flex items-baseline gap-2.5">
            <h1 id="library-heading" className="text-[22px] font-semibold tracking-[-.02em]">
              Library
            </h1>
            <span className="text-[16px] text-text-2" aria-live="polite">
              {matches.length} {matches.length === 1 ? "guide" : "guides"}
            </span>
          </div>

          {tested.length > 0 && (
            <>
              <div className="mb-4 flex items-center gap-2.5">
                <h2 className={sectionHeading}>Tested hands-on</h2>
                <span className={pill}>Verified</span>
              </div>
              <GuideGrid guides={tested} />
            </>
          )}

          {fromDocs.length > 0 && (
            <>
              <div className="mb-4 flex items-center gap-2.5">
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
              <span className="flex items-center gap-1 text-text-3">
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
            <div className="p-2.5">
              {WAIT_ROWS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={wait === key}
                  onClick={() => setWait(key)}
                  className="flex w-full items-center justify-between rounded-md px-2.5 py-[9px] text-left text-[15px] text-text-2 hover:bg-hover aria-pressed:bg-hover aria-pressed:font-medium aria-pressed:text-text"
                >
                  <span>{label}</span>
                  <span className="font-mono text-[12px] font-normal text-text-3">{waitCount(key)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={panel}>
            <Link
              href="/generate"
              className="flex w-full items-center justify-between gap-2 rounded-lg px-4 py-3.5 text-[14px] font-semibold hover:bg-hover"
            >
              Don&apos;t see your app? Generate one
              <ExternalLink size={15} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
