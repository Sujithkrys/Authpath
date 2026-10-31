"use client";

import { Check, Share, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { buttonPrimary } from "@/components/ui";

const TOAST_MS = 2400;

export function ShareButton() {
  const [result, setResult] = useState<"copied" | "failed" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const share = async () => {
    let copied = true;
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // Denied permission, or a non-secure origin where clipboard is undefined.
      copied = false;
    }
    setResult(copied ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setResult(null), TOAST_MS);
  };

  return (
    <>
      <button type="button" onClick={share} className={buttonPrimary}>
        {result === "copied" ? (
          <Check size={15} strokeWidth={2.4} aria-hidden="true" />
        ) : (
          <Share size={15} strokeWidth={1.8} aria-hidden="true" />
        )}
        {result === "copied" ? "Link copied" : "Share guide"}
      </button>

      {/* Stays mounted so screen readers announce the message when it appears. */}
      <div role="status" className="fixed bottom-6 left-1/2 z-10 -translate-x-1/2 max-sm:w-max max-sm:max-w-[calc(100vw-32px)]">
        {result && (
          <div className="flex items-center gap-2 rounded-md bg-text px-3.5 py-2.5 text-[13px] font-semibold text-bg shadow-card">
            {result === "copied" ? (
              <Check size={14} strokeWidth={2.4} aria-hidden="true" />
            ) : (
              <TriangleAlert size={14} strokeWidth={1.8} aria-hidden="true" />
            )}
            {result === "copied" ? "Link copied to clipboard" : "Couldn't copy the link"}
          </div>
        )}
      </div>
    </>
  );
}
