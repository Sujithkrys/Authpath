"use client";

import { Clock, ExternalLink, ChevronUp, Plus, ShieldCheck } from "lucide-react";
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

function GuideCard({ guide }: { guide: GuideWithLogo }) {
  return (
    <Link
      href={`/guides/${guide.id}`}
      aria-label={`Open ${guide.name} guide`}
      className="relative flex w-full items-start gap-3.5 rounded-md border border-border bg-surface p-[18px] text-left transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-border-strong hover:shadow-card"
    >
      <AppLogo guide={guide} />
      <span className="min-w-0 flex-1">
        <span className="mb-[5px] flex items-center gap-1.5 text-[16px] font-semibold">
          {guide.name}
          {guide.tested && <ShieldCheck size={15} strokeWidth={1.8} className="text-accent" aria-hidden="true" />}
        </span>
        <span className="flex flex-col gap-[3px] text-[13px] text-text-2">
          <span className="flex items-center gap-1.5">
            <Clock size={13} strokeWidth={1.8} aria-hidden="true" />
            Setup {guide.setup}
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={13} strokeWidth={1.8} aria-hidden="true" />
            Approval: {guide.wait}
          </span>
        </span>
      </span>
      <DifficultyTag diff={guide.diff} className="absolute top-3.5 right-3.5" />
    </Link>
  );
}

function GuideGrid({ guides }: { guides: GuideWithLogo[] }) {
  return (
    <div className="mb-10 grid grid-cols-3 gap-3.5 max-xl:grid-cols-2 max-sm:grid-cols-1">
      {guides.map((guide) => (
        <GuideCard key={guide.id} guide={guide} />
      ))}
    </div>
  );
}

const sectionHeading = "font-display text-[22px] font-bold tracking-[-.01em]";

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

  const difficultyCount = (key: DifficultyFilter) =>
    key === "all" ? guides.length : guides.filter((guide) => guide.diff === key).length;
  const waitCount = (key: WaitFilter) =>
    key === "all" ? guides.length : guides.filter((guide) => guide.waitKey === key).length;

  return (
    <section aria-labelledby="library-heading">
      <h1 id="library-heading" className="sr-only">
        Guide library
      </h1>

      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
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
              className="group flex items-center justify-center gap-[7px] rounded-sm px-3 py-1.5 text-[14px] text-text-2 aria-pressed:bg-surface aria-pressed:font-semibold aria-pressed:text-text aria-pressed:shadow-card max-sm:flex-1 max-sm:px-2"
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
              <ChevronUp size={16} className="text-text-3" aria-hidden="true" />
            </div>
            <div className="p-2.5">
              {WAIT_ROWS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={wait === key}
                  onClick={() => setWait(key)}
                  className="flex w-full items-center justify-between rounded-md px-2.5 py-[9px] text-left text-[14px] text-text-2 hover:bg-hover aria-pressed:bg-hover aria-pressed:font-semibold aria-pressed:text-text"
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
