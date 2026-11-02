import { Search } from "lucide-react";
import type { ComponentProps } from "react";

import { isDarkMark } from "@/lib/logos";
import type { Difficulty, GuideWithLogo } from "@/types/guide";

export const buttonBase =
  "inline-flex items-center justify-center gap-2 h-9 px-3.5 rounded-sm font-semibold text-[13.5px] whitespace-nowrap transition-colors duration-150";
export const buttonPrimary = `${buttonBase} bg-accent text-on-accent hover:bg-accent-hover`;
export const buttonGhost = `${buttonBase} border border-border-strong bg-surface hover:bg-hover`;

export const panel = "rounded-lg border border-border bg-surface";
export const panelHeader =
  "flex h-10 items-center justify-between border-b border-border px-3.5 text-[13.5px] font-medium";
export const rail =
  "sticky top-4 flex flex-col gap-4 max-lg:static max-lg:grid max-lg:grid-cols-2 max-sm:grid-cols-1";
export const pill = "rounded-full bg-accent-soft px-2 py-px text-[11px] font-semibold text-accent-ink";
export const heroTitle = "font-semibold tracking-[-.025em] text-balance";

const DIFFICULTY_STYLE: Record<Difficulty, string> = {
  easy: "text-ok bg-ok-soft",
  moderate: "text-warn bg-warn-soft",
  hard: "text-bad bg-bad-soft",
  unknown: "text-text-2 bg-hover",
};

/** "2 claims removed, 1 marked uncertain", or a plain all-clear. */
export { describeClaimCheck } from "@/lib/verdict";

export function DifficultyTag({ diff, className = "" }: { diff: Difficulty; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-[5px] rounded-sm px-1.5 py-px font-mono text-[10.5px] font-semibold tracking-[.02em] uppercase ${DIFFICULTY_STYLE[diff]} ${className}`}
    >
      {diff}
    </span>
  );
}

interface AppLogoProps {
  guide: Pick<GuideWithLogo, "color" | "init" | "logoSrc">;
  size?: "md" | "lg";
  /** Border and shadow around the logo. Off for flat cards, where the logo sits bare. */
  framed?: boolean;
}

/**
 * Full-colour logo on a white tile, in both themes so that dark marks like
 * GitHub's stay visible. Apps without a logo get a brand-coloured letter tile.
 */
export function AppLogo({ guide, size = "md", framed = true }: AppLogoProps) {
  const large = size === "lg";

  // Bare 36px mark, as in the Composio app directory cards.
  if (!framed) {
    return guide.logoSrc ? (
      // eslint-disable-next-line @next/next/no-img-element -- next/image refuses SVG by default
      <img
        src={guide.logoSrc}
        alt=""
        aria-hidden="true"
        width={36}
        height={36}
        className={`size-9 flex-none object-contain ${isDarkMark(guide.logoSrc) ? "[filter:var(--logo-dark-filter)]" : ""}`}
      />
    ) : (
      <span
        aria-hidden="true"
        className="grid size-9 flex-none place-items-center rounded-sm text-[15px] font-semibold text-on-accent"
        style={{ backgroundColor: guide.color }}
      >
        {guide.init}
      </span>
    );
  }

  if (guide.logoSrc) {
    return (
      <span
        aria-hidden="true"
        className={`grid flex-none place-items-center rounded-lg border border-border bg-logo-tile shadow-card ${large ? "size-14" : "size-11"}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- next/image refuses SVG by default */}
        <img
          src={guide.logoSrc}
          alt=""
          width={large ? 44 : 34}
          height={large ? 36 : 28}
          className="object-contain"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`grid flex-none place-items-center rounded-lg font-semibold tracking-[-.02em] text-on-accent ${large ? "size-14 text-[20px]" : "size-11 text-[16px]"}`}
      style={{ backgroundColor: guide.color }}
    >
      {guide.init}
    </span>
  );
}

interface SearchFieldProps extends ComponentProps<"input"> {
  label: string;
  iconSize?: number;
  /** Width and height of the field. */
  fieldClassName: string;
}

export function SearchField({ label, iconSize = 16, fieldClassName, ...input }: SearchFieldProps) {
  return (
    <label
      className={`flex items-center gap-2.5 rounded-sm border border-border bg-surface px-3 text-text-2 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-soft ${fieldClassName}`}
    >
      <Search size={iconSize} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input
        className="min-w-0 flex-1 bg-transparent text-[13.5px] text-text outline-none placeholder:text-text-2"
        {...input}
      />
    </label>
  );
}
