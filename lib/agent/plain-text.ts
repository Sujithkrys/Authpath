/**
 * Plain-text copies of docs pages that a site may publish next to its HTML: a
 * markdown version of the page (page.md, or one the page links as an
 * alternate), and llms.txt / llms-full.txt at the root of the docs site.
 * They're read when the HTML itself can't be (a JavaScript app, a block, or too
 * little text), and only on the provider's own docs domains.
 */

import { hostOf } from "@/lib/agent/urls";

/** Markdown reduced to the words a reader sees, so quotes are checked the same way as HTML text. Underscores stay (public_profile). */
export function markdownToText(markdown: string): string {
  return markdown
    .replace(/```[a-z0-9-]*\n?/gi, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/gm, "$1$2")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The first top-level heading, as a title. */
export function markdownTitle(markdown: string): string {
  return markdownToText(markdown.match(/^#\s+(.+)$/m)?.[1] ?? "").slice(0, 140);
}

/** True when a body is an HTML page rather than plain text, e.g. a site answering every path with its app shell. */
export const looksLikeHtml = (body: string) => /^\s*(<!doctype html|<html|<head|<body)/i.test(body);

/**
 * Where a markdown copy of a page may live, best first: one the page itself
 * links as an alternate (<link rel="alternate" type="text/markdown">), then the
 * common conventions page.md and page/index.md. Same host only.
 */
export function markdownAlternates(url: string, html: string): string[] {
  let page: URL;
  try {
    page = new URL(url);
  } catch {
    return [];
  }
  const linked = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /rel=["']?alternate/i.test(tag) && /type=["']?text\/(markdown|x-markdown|plain)/i.test(tag))
    .flatMap((tag) => {
      const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
      try {
        return href ? [new URL(href, url).toString()] : [];
      } catch {
        return [];
      }
    });
  const base = `${page.origin}${page.pathname.replace(/\/$/, "").replace(/\.html?$/i, "")}`;
  const conventional = page.pathname === "/" || /\.md$/i.test(page.pathname) ? [] : [`${base}.md`, `${base}/index.md`];
  return [...new Set([...linked, ...conventional])].filter((candidate) => hostOf(candidate) === page.hostname);
}

/** The llms.txt files at the root of a docs host. */
export const llmsFiles = (host: string) => ({ index: `https://${host}/llms.txt`, full: `https://${host}/llms-full.txt` });

export const isLlmsFile = (url: string) => /\/llms(-full)?\.txt$/i.test(new URL(url).pathname);
