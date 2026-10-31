"use client";

import { Moon } from "lucide-react";

export function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const isDark = root.dataset.theme
      ? root.dataset.theme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = isDark ? "light" : "dark";
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="ml-auto grid size-[30px] place-items-center rounded-md text-text-2 hover:bg-hover"
    >
      <Moon size={17} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
