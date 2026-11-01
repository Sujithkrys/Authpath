import {
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import Link from "next/link";

import { ShareButton } from "@/components/share-button";
import { OtherPages, SourceList } from "@/components/source-list";
import { AppLogo, DifficultyTag, buttonGhost, describeClaimCheck, panel, panelHeader, pill, rail } from "@/components/ui";
import { formatGeneratedAt } from "@/lib/format";
import type { Evidence, GuideWithLogo, StepLink as StepLinkData, StepOwner } from "@/types/guide";

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1);

/** "Hard: Gmail scopes need a security assessment" reads "Gmail scopes need…" under a stat that already says Hard. */
/** The stat already says the rating, so the note drops a leading "Hard:" and starts with a capital. */
const reasonNote = (reason: string, diff: string) => {
  const rest = reason.replace(new RegExp(`^${diff}\\s*[:—–-]\\s*`, "i"), "");
  return rest.charAt(0).toUpperCase() + rest.slice(1);
};

const sectionHeading = "mb-3.5 text-[18px] font-semibold tracking-[-.01em]";
const whoBlock = "p-4 [&+&]:border-t [&+&]:border-border";
const whoHeading = "mb-2.5 flex items-center gap-2 text-[15px] font-semibold";
const whoList = "flex flex-col gap-2";
const whoItem = "flex gap-[9px] text-[14px] text-text-2";

/** Renders inline <code> from step text as elements, never as raw HTML. */
function StepText({ text }: { text: string }) {
  return text.split(/<code>(.*?)<\/code>/).map((part, index) =>
    index % 2 === 1 ? (
      <code
        key={index}
        className="rounded-sm border border-border bg-surface-2 px-1.5 py-px font-mono text-[13px] [overflow-wrap:anywhere] text-text"
      >
        {part}
      </code>
    ) : (
      part
    ),
  );
}

function OwnerTag({ owner }: { owner: StepOwner }) {
  const base = "inline-flex items-center gap-[5px] rounded-full px-2 py-0.5 text-[12px] font-semibold";
  return owner === "agent" ? (
    <span className={`${base} bg-accent-soft text-accent-ink`}>
      <Bot size={12} strokeWidth={1.8} aria-hidden="true" />
      Agent can do
    </span>
  ) : (
    <span className={`${base} border border-border bg-surface-2 text-text-2`}>
      <UserRound size={12} strokeWidth={1.8} aria-hidden="true" />
      You
    </span>
  );
}

function EvidenceTag({ evidence }: { evidence: Evidence }) {
  const base = "mt-2 inline-flex items-center gap-[5px] text-[12px]";
  if (evidence === "verified") {
    return (
      <span className={`${base} text-ok`}>
        <Check size={13} strokeWidth={2.4} aria-hidden="true" />
        Tested in a real setup
      </span>
    );
  }
  if (evidence === "uncertain") {
    return (
      <span className={`${base} text-warn`}>
        <TriangleAlert size={13} strokeWidth={1.8} aria-hidden="true" />
        Not confirmed
      </span>
    );
  }
  return (
    <span className={`${base} text-text-3`}>
      <FileText size={13} strokeWidth={1.8} aria-hidden="true" />
      From provider docs
    </span>
  );
}

/**
 * A link to the page a generated step or blocker rests on. One line, cut short
 * with an ellipsis, so a long address can't widen the page.
 */
function SourceLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={url}
      className="mt-1 block max-w-full truncate font-mono text-[11.5px] text-text-3 hover:text-text"
    >
      {url.replace(/^https:\/\//, "")}
    </a>
  );
}

/** Where to do a step, by name: generated steps never show a raw URL. */
function StepLink({ link }: { link: StepLinkData }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      title={link.url}
      className="mt-2 inline-flex max-w-full items-center gap-1.5 text-[14px] font-medium text-accent-ink hover:underline"
    >
      <span className="min-w-0 [overflow-wrap:anywhere]">{link.label}</span>
      <ExternalLink size={13} strokeWidth={1.8} aria-hidden="true" />
    </a>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0 border-r border-border px-[18px] py-4 last:border-r-0 max-md:even:border-r-0 max-md:nth-[-n+2]:border-b">
      <div className="mb-1.5 font-mono text-[11px] tracking-[.08em] text-text-3 uppercase">{label}</div>
      <div className="text-[20px] font-semibold tracking-[-.01em] tabular-nums [overflow-wrap:anywhere]">{value}</div>
      <div className="mt-0.5 text-[13px] text-text-2 [overflow-wrap:anywhere]">{note}</div>
    </div>
  );
}

export function GuideView({ guide }: { guide: GuideWithLogo }) {
  const estimated = guide.diff !== "unknown" && guide.diffConfirmed === false;
  return (
    <section aria-labelledby="guide-heading">
      <Link
        href={guide.generated ? "/generate" : "/"}
        className="mb-[22px] inline-flex items-center gap-1.5 text-[15px] text-text-2 hover:text-text"
      >
        <ChevronLeft size={16} aria-hidden="true" />
        {guide.generated ? "Back to generator" : "All guides"}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-[18px] border-b border-border pb-6">
        <div className="flex min-w-0 items-center gap-4">
          <AppLogo guide={guide} size="lg" />
          <div className="min-w-0">
            <h1
              id="guide-heading"
              className="mb-1 text-[28px] leading-[1.15] font-semibold tracking-[-.02em] max-sm:text-[24px]"
            >
              {guide.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-[15px] text-text-2">
              <DifficultyTag diff={guide.diff} />
              {estimated && <span className="text-[13px] text-text-2">Not fully confirmed</span>}
              {guide.generated ? (
                <>
                  <span className={pill}>Generated by agent</span>
                  {guide.generatedAt && (
                    <time dateTime={guide.generatedAt} className="text-[14px]">
                      {formatGeneratedAt(guide.generatedAt)}
                    </time>
                  )}
                </>
              ) : guide.tested ? (
                <span className="flex items-center gap-[5px] text-accent-ink">
                  <ShieldCheck size={14} strokeWidth={1.8} aria-hidden="true" />
                  Tested hands-on
                </span>
              ) : (
                <span>From provider docs</span>
              )}
            </div>
            {guide.claimCheck && (
              <p className="mt-1.5 text-[13px] text-text-2">
                Checked against cited pages: {describeClaimCheck(guide.claimCheck)}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <a href={`https://${guide.site}`} target="_blank" rel="noreferrer" className={buttonGhost}>
            <ExternalLink size={15} strokeWidth={1.8} aria-hidden="true" />
            Open developer console
          </a>
          <ShareButton />
        </div>
      </div>

      <div className="mt-6 mb-8 grid grid-cols-4 rounded-lg border border-border bg-surface max-md:grid-cols-2">
        <Stat
          label="Difficulty"
          value={estimated ? `${capitalize(guide.diff)} (not fully confirmed)` : capitalize(guide.diff)}
          note={guide.diffReason ? reasonNote(guide.diffReason, guide.diff) : `${guide.steps.length} steps`}
        />
        <Stat label="Your setup time" value={guide.setup} note={guide.generated ? "Rough estimate" : "Hands-on work"} />
        <Stat label="Approval wait" value={guide.wait} note="Provider-side" />
        <Stat label="Review needed" value={guide.review} note="Before launch" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-8 max-lg:grid-cols-1">
        <div>
          <div className="mb-[34px]">
            <h2 className={sectionHeading}>Setup steps</h2>
            <ol className="overflow-hidden rounded-lg border border-border">
              {guide.steps.map((step, index) => (
                <li
                  key={step.t}
                  className="grid grid-cols-[32px_minmax(0,1fr)] gap-3.5 border-b border-border bg-surface p-[18px] last:border-b-0"
                >
                  <span className="grid size-7 place-items-center rounded-full border border-border bg-surface-2 font-mono text-[12px] font-semibold">
                    {index + 1}
                  </span>
                  <div>
                    <div className="mb-1 flex flex-wrap items-start justify-between gap-2.5">
                      <b className="text-[15px] font-semibold">{step.t}</b>
                      <OwnerTag owner={step.o} />
                    </div>
                    <p className="max-w-[62ch] text-[15px] text-text-2 [overflow-wrap:anywhere]">
                      <StepText text={step.d} />
                    </p>
                    {step.link && (
                      <div>
                        <StepLink link={step.link} />
                      </div>
                    )}
                    <EvidenceTag evidence={step.e} />
                    {step.source && <SourceLink url={step.source} />}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {guide.blockers.length > 0 && (
            <div className="mb-[34px]">
              <h2 className={sectionHeading}>What could block you</h2>
              <div className="flex flex-col gap-2.5">
                {guide.blockers.map((blocker) => (
                  <div
                    key={blocker.b}
                    className="flex gap-3 rounded-md border border-l-[3px] border-border border-l-warn bg-surface px-4 py-3.5"
                  >
                    <TriangleAlert size={18} strokeWidth={1.8} className="mt-px text-warn" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <b className="mb-0.5 block text-[15px]">{blocker.b}</b>
                      <span className="text-[14px] text-text-2">{blocker.s}</span>
                      {blocker.source && <SourceLink url={blocker.source} />}
                      {guide.generated && !blocker.source && (
                        <div>
                          <EvidenceTag evidence="uncertain" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={rail}>
          <div className={panel}>
            <div className={whoBlock}>
              <h2 className={whoHeading}>
                <Bot size={16} strokeWidth={1.8} className="text-accent" aria-hidden="true" />
                The agent can do
              </h2>
              <ul className={whoList}>
                {guide.agent.map((item) => (
                  <li key={item} className={whoItem}>
                    <Check size={14} strokeWidth={2.4} className="mt-[3px] text-accent" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className={whoBlock}>
              <h2 className={whoHeading}>
                <UserRound size={16} strokeWidth={1.8} aria-hidden="true" />
                You take over
              </h2>
              <ul className={whoList}>
                {guide.you.map((item) => (
                  <li key={item} className={whoItem}>
                    <ChevronRight size={14} className="mt-[3px] text-text-3" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className={panel}>
            <div className={panelHeader}>
              <h2>Sources checked</h2>
            </div>
            <SourceList sources={guide.sources} />
            {guide.otherPages && <OtherPages pages={guide.otherPages} />}
            <p className="border-t border-border px-4 py-3 text-[13px] text-text-2">
              Approval times are the provider&apos;s stated ranges unless marked tested.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
