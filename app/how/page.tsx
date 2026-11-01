import { Check, FileText, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { DifficultyTag, buttonPrimary, heroTitle } from "@/components/ui";
import type { Difficulty } from "@/types/guide";

export const metadata: Metadata = { title: "How it's checked" };

const sectionHeading = "mb-1 text-[18px] leading-[26px] font-semibold tracking-[-.01em]";
const sectionIntro = "mb-4 text-[14px] text-text-2";

const LEVELS: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <Check size={16} strokeWidth={2.4} className="text-ok" aria-hidden="true" />,
    title: "Tested in a real setup",
    text: "We created the OAuth app ourselves and followed the step. No guide is at this level yet.",
  },
  {
    icon: <FileText size={16} strokeWidth={1.8} className="text-text-2" aria-hidden="true" />,
    title: "From provider docs",
    text: "Taken from the provider's own documentation. The page is linked under the step and in Sources.",
  },
  {
    icon: <TriangleAlert size={16} strokeWidth={1.8} className="text-warn" aria-hidden="true" />,
    title: "Not confirmed",
    text: "The docs didn't settle it, or only partly support it. Treat it as a lead and check with the provider.",
  },
];

const STAGES: { title: string; text: string }[] = [
  {
    title: "Identify the app",
    text: "Finds the official docs and decides what kind of app it is. Only OAuth providers get a guide. Apps without OAuth, and platforms like Composio, get a short result card instead.",
  },
  {
    title: "Research the checklist",
    text: "Reads the provider's own pages for ten fixed items, such as where to register, redirect URI rules, scopes and credentials. Each answer needs a source, or it's marked not found.",
  },
  {
    title: "Check for review or approval",
    text: "Looks for reviews, verification, limits before approval and published timelines. A timeline is only shown if it appears word for word on an official page.",
  },
  {
    title: "Write the steps",
    text: "Turns the checklist into 3 to 8 short steps. Anything that needs your account, like signing in or submitting, is marked for you rather than the agent.",
  },
  {
    title: "Check every claim",
    text: "A separate pass compares each claim with the page it cites. Supported claims stay, partly supported ones are marked Not confirmed, and unsupported ones are removed.",
  },
];

const RATINGS: { diff: Difficulty; text: string }[] = [
  { diff: "easy", text: "Real users can connect without a review. Any review is only for an optional marketplace listing." },
  { diff: "moderate", text: "It works without a review, but with limits until you're reviewed, such as a user cap or lower rate limits." },
  { diff: "hard", text: "A review, verification, security assessment, partner program or paid plan comes first, for some or all scopes." },
  { diff: "unknown", text: "No official page we read supports any rating." },
];

const RULES = [
  "Only the provider's own docs count as sources. Blogs, marketing pages and third-party sites are never used.",
  "Links that don't load are dropped, so a guide never sends you to a page that doesn't exist.",
  "When a rating rests on a page that only partly supports it, the guide says \"not fully confirmed\".",
];

export default function HowPage() {
  return (
    <section aria-labelledby="how-heading" className="mx-auto mt-2 max-w-[880px]">
      {/* Same heading and intro styles as the Generate page. */}
      <h1 id="how-heading" className={`${heroTitle} mb-4 text-center text-[clamp(30px,3.6vw,40px)] leading-[1.12]`}>
        How guides are checked
      </h1>
      <p className="mx-auto mb-12 max-w-[520px] text-center text-[16px] text-text-2">
        Every guide comes from the provider&apos;s official docs. A second pass checks each claim against the page it
        cites, and anything it can&apos;t confirm is labelled, not hidden.
      </p>

      <h2 className={sectionHeading}>Evidence levels</h2>
      <p className={sectionIntro}>Every step and answer carries one of these.</p>
      <div className="mb-10 grid grid-cols-3 gap-3 max-md:grid-cols-1">
        {LEVELS.map(({ icon, title, text }) => (
          <div key={title} className="rounded-sm border border-border bg-surface p-4">
            <div className="mb-1.5 flex items-center gap-2 text-[15px] font-semibold">
              {icon}
              {title}
            </div>
            <p className="text-[14px] text-text-2">{text}</p>
          </div>
        ))}
      </div>

      <h2 className={sectionHeading}>How a generated guide is made</h2>
      <p className={sectionIntro}>The same five stages you see while a guide is generated.</p>
      <ol className="mb-10 overflow-hidden rounded-sm border border-border bg-surface">
        {STAGES.map(({ title, text }, index) => (
          <li key={title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3.5 border-b border-border p-4 last:border-b-0">
            <span className="grid size-7 place-items-center rounded-full border border-border bg-surface-2 font-mono text-[12px] font-semibold">
              {index + 1}
            </span>
            <div>
              <b className="mb-0.5 block text-[15px] font-semibold">{title}</b>
              <p className="text-[14px] text-text-2">{text}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className={sectionHeading}>How difficulty is rated</h2>
      <p className={sectionIntro}>One question decides it: can real users connect at scale without a review?</p>
      <div className="mb-10 overflow-hidden rounded-sm border border-border bg-surface">
        {RATINGS.map(({ diff, text }) => (
          <div key={diff} className="grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-3 border-b border-border px-4 py-3.5 last:border-b-0 max-sm:grid-cols-1 max-sm:gap-1.5">
            <div>
              <DifficultyTag diff={diff} />
            </div>
            <p className="text-[14px] text-text-2">{text}</p>
          </div>
        ))}
      </div>

      <h2 className={sectionHeading}>Rules every guide follows</h2>
      <ul className="mb-10 mt-3 flex flex-col gap-2.5">
        {RULES.map((rule) => (
          <li key={rule} className="flex gap-2.5 text-[14px] text-text-2">
            <Check size={15} strokeWidth={2.2} className="mt-[3px] flex-none text-accent" aria-hidden="true" />
            {rule}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border bg-surface px-4 py-3.5">
        <span className="text-[14px] text-text-2">Don&apos;t see your app in the library?</span>
        <Link href="/generate" className={buttonPrimary}>
          Generate a guide
        </Link>
      </div>
    </section>
  );
}
