import type { Metadata } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { AppStateProvider } from "@/components/app-state";
import { Sidebar } from "@/components/sidebar";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

export const metadata: Metadata = {
  title: { default: "Authpath", template: "%s · Authpath" },
  description: "OAuth app setup guides for developers.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable} ${jetbrainsMono.variable}`}>
      <body>
        <AppStateProvider>
          <div className="grid min-h-screen grid-cols-[260px_minmax(0,1fr)] bg-[linear-gradient(to_right,var(--side)_259px,var(--border)_259px,var(--border)_260px,var(--bg)_260px)] max-md:grid-cols-1 max-md:grid-rows-[auto_1fr] max-md:bg-none">
            <Sidebar />
            <main className="min-w-0 px-10 pt-7 pb-16 max-md:px-4 max-md:pt-[22px] max-md:pb-12">
              {children}
              <p className="mt-7 font-mono text-[11px] text-text-3">
                Sample content for layout review — verify every fact against provider docs during the build.
              </p>
            </main>
          </div>
        </AppStateProvider>
      </body>
    </html>
  );
}
