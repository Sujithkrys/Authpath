import { Search } from "lucide-react";
import type { ComponentProps } from "react";

import type { Difficulty, GuideWithLogo } from "@/types/guide";

export const buttonBase =
  "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-sm font-semibold text-[14px] whitespace-nowrap transition-colors duration-150";
export const buttonPrimary = `${buttonBase} bg-accent text-on-accent hover:bg-accent-hover`;
export const buttonGhost = `${buttonBase} border border-border-strong bg-surface hover:bg-hover`;

export const panel = "rounded-lg border border-border bg-surface";
export const panelHeader =
  "flex items-center justify-between border-b border-border px-4 py-3.5 text-[15px] font-semibold";
export const rail =
  "sticky top-7 flex flex-col gap-4 max-lg:static max-lg:grid max-lg:grid-cols-2 max-sm:grid-cols-1";
export const pill = "rounded-full bg-accent-soft px-2 py-px text-[11.5px] font-semibold text-accent-ink";
export const heroTitle = "font-display font-extrabold tracking-[-.03em] text-balance";

const DIFFICULTY_STYLE: Record<Difficulty, string> = {
  easy: "text-ok bg-ok-soft",
  moderate: "text-warn bg-warn-soft",
  hard: "text-bad bg-bad-soft",
};

export function DifficultyTag({ diff, className = "" }: { diff: Difficulty; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-[5px] rounded-sm px-[7px] py-0.5 font-mono text-[11px] font-semibold tracking-[.02em] uppercase ${DIFFICULTY_STYLE[diff]} ${className}`}
    >
      {diff}
    </span>
  );
}

interface AppLogoProps {
  guide: Pick<GuideWithLogo, "color" | "init" | "logoSrc">;
  size?: "md" | "lg";
}

/**
 * Full-colour logo on a white tile, in both themes so that dark marks like
 * GitHub's stay visible. Apps without a logo get a brand-coloured letter tile.
 */
export function AppLogo({ guide, size = "md" }: AppLogoProps) {
  const large = size === "lg";

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
      className={`grid flex-none place-items-center rounded-lg font-display font-bold tracking-[-.02em] text-on-accent ${large ? "size-14 text-[20px]" : "size-11 text-[16px]"}`}
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
      className={`flex items-center gap-2.5 rounded-sm border border-border-strong bg-surface px-3 text-text-3 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-soft ${fieldClassName}`}
    >
      <Search size={iconSize} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input
        className="min-w-0 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-text-3"
        {...input}
      />
    </label>
  );
}
