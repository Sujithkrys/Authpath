"use client";

import { BookOpen, Check, FileText, LayoutGrid, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/", label: "Library", icon: LayoutGrid },
  { href: "/generate", label: "Generate guide", icon: Sparkles },
  { href: "/how", label: "How it's checked", icon: BookOpen },
];

function isCurrent(href: string, pathname: string) {
  // Guide pages sit under Library, as they do in the mockup.
  if (href === "/") return pathname === "/" || pathname.startsWith("/guides/");
  return pathname === href;
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Main"
      className="sticky top-0 flex h-screen flex-col border-r border-border bg-side max-md:z-5 max-md:h-auto max-md:flex-row max-md:items-center max-md:overflow-x-auto max-md:border-r-0 max-md:border-b"
    >
      <div className="flex h-14 flex-none items-center justify-between border-b border-border px-[18px] max-md:h-auto max-md:flex-none max-md:gap-2.5 max-md:border-b-0 max-md:px-3.5 max-md:py-3">
        <div className="flex items-center gap-2.5">
          <div className="grid size-[26px] place-items-center rounded-sm bg-text text-bg">
            <ShieldCheck size={15} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <span className="rounded-sm border-[1.5px] border-accent px-[7px] py-0.5 font-mono text-[11px] font-semibold tracking-[.1em] text-accent-ink max-md:hidden">
            AUTHPATH
          </span>
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-2 py-3.5 max-md:flex-none max-md:flex-row max-md:p-2">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isCurrent(href, pathname) ? "page" : undefined}
            className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13.5px] text-text transition-colors duration-150 hover:bg-hover aria-[current=page]:bg-hover max-md:whitespace-nowrap"
          >
            <Icon size={17} strokeWidth={1.7} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mx-2 mt-auto mb-3 rounded-lg border border-border bg-surface p-3.5 shadow-card max-md:hidden">
        <h2 className="mb-1 flex items-center gap-2 text-[14px] font-semibold">
          <ShieldCheck size={16} strokeWidth={1.8} className="text-accent" aria-hidden="true" />
          Evidence levels
        </h2>
        <p className="mb-3 text-[13.5px] leading-[1.45] text-text-2">Every step says how we know it.</p>
        <div className="flex flex-col gap-[7px] text-[13px] text-text-2">
          <span className="flex items-center gap-2">
            <Check size={14} strokeWidth={2.4} className="text-ok" aria-hidden="true" />
            Tested in a real setup
          </span>
          <span className="flex items-center gap-2">
            <FileText size={14} strokeWidth={1.8} className="text-text-3" aria-hidden="true" />
            From provider docs
          </span>
          <span className="flex items-center gap-2">
            <TriangleAlert size={14} strokeWidth={1.8} className="text-warn" aria-hidden="true" />
            Not confirmed
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 border-t border-border px-[18px] py-3.5 max-md:hidden">
        <div className="grid size-[30px] place-items-center rounded-full bg-accent text-[14px] font-semibold text-on-accent">
          S
        </div>
        <div>
          <b className="block text-[14px] leading-[1.2] font-medium">Sujith T.</b>
          <small className="text-[12px] text-text-3">APM take-home</small>
        </div>
        <ThemeToggle />
      </div>
    </aside>
  );
}
