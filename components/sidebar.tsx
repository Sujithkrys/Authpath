"use client";

import { BookOpen, LayoutGrid, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
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
          <BrandMark size={28} />
          <span className="text-[17px] font-semibold tracking-[-.02em] max-md:hidden">Authpath</span>
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

      <div className="mt-auto flex items-center gap-2.5 border-t border-border px-[18px] py-3.5 max-md:hidden">
        <div className="grid size-[30px] place-items-center rounded-full bg-accent text-[14px] font-semibold text-on-accent">
          S
        </div>
        <b className="text-[14px] font-medium">Sujith</b>
        <ThemeToggle />
      </div>
    </aside>
  );
}
