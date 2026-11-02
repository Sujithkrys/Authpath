import { ChevronRight, FileText } from "lucide-react";

import { pageTitle } from "@/lib/text";
import type { GuideSource, ReadMethod } from "@/types/guide";

/**
 * One official page: its title, and its address cut short with an ellipsis so a
 * long URL can never push the page sideways. The full address stays in the link
 * and its tooltip.
 */
/** How a page was read, in plain words. Only guides made by the new rules record it. */
const READ_METHOD_LABEL: Record<ReadMethod, string> = {
  fetch: "Read directly",
  url_context: "Read through Gemini URL context",
  markdown: "Read from the page's markdown version",
  llms_txt: "Read from the site's llms.txt files",
  sitemap: "Found in the site's sitemap, then read",
  openid_discovery: "OpenID discovery file",
};

function SourceItem({ source: [title, url], method }: { source: GuideSource; method?: ReadMethod }) {
  return (
    <li>
      <a
        href={`https://${url}`}
        target="_blank"
        rel="noreferrer"
        title={`https://${url}`}
        className="flex min-w-0 items-start gap-2.5 rounded-md px-2.5 py-[9px] text-[13.5px] text-text-2 hover:bg-hover hover:text-text"
      >
        <FileText size={15} strokeWidth={1.8} className="mt-0.5" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block [overflow-wrap:anywhere]">{pageTitle(title)}</span>
          <span className="block truncate font-mono text-[11.5px] text-text-3">{url}</span>
          {method && <span className="mt-0.5 block text-[11.5px] text-text-3">{READ_METHOD_LABEL[method]}</span>}
        </span>
      </a>
    </li>
  );
}

export function SourceList({ sources, methods }: { sources: GuideSource[]; methods?: Record<string, ReadMethod> }) {
  return (
    <ul className="p-1.5">
      {sources.map((source) => (
        // Library guides can list one URL under two titles, so neither alone is unique.
        <SourceItem key={source.join(" ")} source={source} method={methods?.[source[1]]} />
      ))}
    </ul>
  );
}

/** Pages the agent read but no claim cites. Collapsed, because they back nothing on the page. */
export function OtherPages({ pages, methods }: { pages: GuideSource[]; methods?: Record<string, ReadMethod> }) {
  if (pages.length === 0) return null;
  return (
    <details className="group border-t border-border">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-3 text-[13px] text-text-2 hover:text-text [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} className="transition-transform group-open:rotate-90" aria-hidden="true" />
        Other pages read ({pages.length})
      </summary>
      <div className="-mt-1.5 pb-1.5">
        <SourceList sources={pages} methods={methods} />
      </div>
    </details>
  );
}

/** Pages chosen for reading that no method could read. Nothing on the page rests on them. */
export function UnreadPages({ pages }: { pages: string[] }) {
  if (pages.length === 0) return null;
  return (
    <details className="group border-t border-border">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-3 text-[13px] text-text-2 hover:text-text [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} className="transition-transform group-open:rotate-90" aria-hidden="true" />
        Couldn&apos;t read ({pages.length})
      </summary>
      <ul className="-mt-1.5 px-1.5 pb-1.5">
        {pages.map((url) => (
          <li key={url}>
            <a
              href={`https://${url}`}
              target="_blank"
              rel="noreferrer"
              title={`https://${url}`}
              className="block truncate rounded-md px-2.5 py-[7px] font-mono text-[11.5px] text-text-3 hover:bg-hover hover:text-text"
            >
              {url}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
