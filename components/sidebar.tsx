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
      <div className="flex items-center justify-between border-b border-border px-[18px] pt-[18px] pb-4 max-md:flex-none max-md:gap-2.5 max-md:border-b-0 max-md:px-3.5 max-md:py-3">
        <div className="flex items-center gap-2.5">
          <div className="grid size-[26px] place-items-center rounded-sm bg-text text-bg">
            <ShieldCheck size={15} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <span className="rounded-sm border-[1.5px] border-accent px-[7px] py-0.5 font-mono text-[11px] font-semibold tracking-[.1em] text-accent-ink max-md:hidden">
            AUTHPATH
          </span>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-2.5 py-3.5 max-md:flex-none max-md:flex-row max-md:p-2">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isCurrent(href, pathname) ? "page" : undefined}
            className="flex w-full items-center gap-3 rounded-md px-3 py-[9px] text-left text-[15px] text-text-2 transition-colors duration-150 hover:bg-hover hover:text-text aria-[current=page]:bg-hover aria-[current=page]:font-medium aria-[current=page]:text-text max-md:px-2.5 max-md:py-2 max-md:text-[15px] max-md:whitespace-nowrap"
          >
            <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mx-3 mt-auto mb-3 rounded-lg border border-border bg-surface p-3.5 shadow-card max-md:hidden">
        <h2 className="mb-1.5 flex items-center gap-2 text-[15px] font-semibold">
          <ShieldCheck size={16} strokeWidth={1.8} className="text-accent" aria-hidden="true" />
          Evidence levels
        </h2>
        <p className="mb-3 text-[13px] leading-[1.45] text-text-2">Every step says how we know it.</p>
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
          <b className="block text-[15px] leading-[1.2] font-semibold">Sujith T.</b>
          <small className="text-[12px] text-text-3">APM take-home</small>
        </div>
        <ThemeToggle />
      </div>
    </aside>
  );
}
