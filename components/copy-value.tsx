"use client";

import { Check, Copy, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const RESET_MS = 1800;

/** A value someone pastes, with a button that copies it. */
export function CopyValue({ value }: { value: string }) {
  const [result, setResult] = useState<"copied" | "failed" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    let copied = true;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      copied = false;
    }
    setResult(copied ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setResult(null), RESET_MS);
  };

  const Icon = result === "copied" ? Check : result === "failed" ? TriangleAlert : Copy;
  const label = result === "copied" ? `Copied ${value}` : result === "failed" ? `Couldn't copy ${value}` : `Copy ${value}`;

  return (
    <>
      <code className="rounded-sm border border-border bg-surface-2 px-1.5 py-px font-mono text-[13px] [overflow-wrap:anywhere] text-text">
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        title={label}
        className={`ml-0.5 inline-grid size-6 place-items-center rounded-sm align-middle hover:bg-hover ${result === "failed" ? "text-warn" : result === "copied" ? "text-ok" : "text-text-3"}`}
      >
        <Icon size={13} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </>
  );
}
