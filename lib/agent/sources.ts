/**
 * What counts as an official source, enforced in code. A page is only
 * considered at all if it's on the provider's own domains, on the site itself
 * or a docs-type subdomain, and its path doesn't look like marketing.
 */

import { hostOf, isUnder } from "@/lib/agent/urls";

/** Never official, whatever a model or a search says. */
export const THIRD_PARTY_DOMAINS = [
  "medium.com",
  "dev.to",
  "stackoverflow.com",
  "stackexchange.com",
  "reddit.com",
  "quora.com",
  "youtube.com",
  "wikipedia.org",
  "hashnode.dev",
  "substack.com",
  "github.io",
  "g2.com",
  "capterra.com",
  "zapier.com",
  "pipedream.com",
  "n8n.io",
  "nango.dev",
  "make.com",
  "postman.com",
  "rapidapi.com",
];

/** Second-level labels under which a registrable domain takes three labels, e.g. example.co.uk. */
const SECOND_LEVEL = new Set(["co", "com", "net", "org", "gov", "ac", "edu"]);

/** The registrable domain a host belongs to: docs.example.co.uk -> example.co.uk. */
export function baseDomain(host: string): string {
  const labels = host.toLowerCase().replace(/^www\./, "").split(".");
  if (labels.length >= 3 && labels.at(-1)!.length === 2 && SECOND_LEVEL.has(labels.at(-2)!)) {
    return labels.slice(-3).join(".");
  }
  return labels.slice(-2).join(".");
}

/** Subdomain labels that mark a docs, developer, API or help site. */
const DOCS_LABELS = new Set([
  "docs",
  "doc",
  "developer",
  "developers",
  "dev",
  "devs",
  "devcenter",
  "api",
  "apis",
  "help",
  "support",
  "learn",
  "cloud",
  "platform",
]);

/** Paths that are marketing, news or reference material, never setup docs. */
const BLOCKED_PATH =
  /(^|\/)(blog|blogs|content|use-?cases?|pricing|plans|customers?|customer-stories|case-stud(y|ies)|news|newsroom|press|webinars?|events?|podcasts?|videos?|glossary|changelog|release-notes|careers|jobs|legal|privacy|terms|tos|cookies?|about|company|compare|vs|alternatives?|templates|community|forum|forums|status|now|stories|ebooks?|whitepapers?|resources|academy|login|signin|sign-in|signup|sign-up|register-account|demo|contact-sales|affiliates?|brand|tag|tags|author|authors|category|categories)(\/|$|\.)/i;

/** Paths that are marketing on a company's main site, but can be real docs on a docs subdomain. */
const MARKETING_ON_MAIN_SITE = /(^|\/)(integrations?|solutions?|features?|products?|apps|partners?|marketplace|industries|tools?)(\/|$)/i;

/** API reference pages for single endpoints: /reference/..., or dotted method names like invoices.approve. */
const ENDPOINT_REFERENCE = /(^|\/)(api-?reference|reference|endpoints?|methods?)\/|\/[a-z]+\.(?!(html?|php|aspx?|md)$)[a-z][a-z.]*$/i;
const AUTH_PATH = /oauth|auth|scope|token|permission|consent|redirect|(^|[/\-_.])apps?([/\-_.]|$)/i;

const ASSET = /\.(png|jpe?g|svg|gif|webp|css|js|ico|woff2?|xml|zip|json|txt|mp4|webm)$/i;

/** True when a host is the provider's own site or one of its docs-type subdomains. */
export function isOfficialHost(host: string, domains: string[]): boolean {
  const bare = host.toLowerCase().replace(/^www\./, "");
  if (THIRD_PARTY_DOMAINS.some((domain) => isUnder(bare, domain))) return false;

  return domains.some((domain) => {
    const base = baseDomain(domain);
    if (!isUnder(bare, base)) return false;
    if (bare === base) return true;
    // A domain the provider named explicitly, e.g. docs.slack.dev, counts as a whole.
    if (domain !== base && isUnder(bare, domain.replace(/^www\./, ""))) return true;
    const sub = bare.slice(0, -(base.length + 1)).split(".");
    return sub.some((label) => DOCS_LABELS.has(label));
  });
}

const isDocsHost = (host: string) => host.split(".").some((label) => DOCS_LABELS.has(label));

/**
 * The single test for whether a page may be read or cited: https, on an
 * official host, and not a marketing, news or endpoint-reference path.
 */
export function isOfficialSource(url: string, domains: string[]): boolean {
  if (!url.startsWith("https://")) return false;
  const host = hostOf(url);
  if (!host || !isOfficialHost(host, domains)) return false;

  let path: string;
  try {
    path = decodeURIComponent(new URL(url).pathname).toLowerCase();
  } catch {
    return false;
  }
  if (ASSET.test(path) || BLOCKED_PATH.test(path)) return false;
  if (!isDocsHost(host) && MARKETING_ON_MAIN_SITE.test(path)) return false;
  if (ENDPOINT_REFERENCE.test(path) && !AUTH_PATH.test(path)) return false;
  return true;
}

/** Words that show a page is about OAuth or registering an app. */
const OAUTH_TERMS: RegExp[] = [
  /\boauth\b/i,
  /\bclient[ _-]?(id|secret)\b/i,
  /\bredirect[ _-]?(uri|url)s?\b/i,
  /\bcallback[ _-]?(uri|url)s?\b/i,
  /\bscopes?\b/i,
  /\bauthori[sz](ation|e)\b/i,
  /\baccess[ _-]?tokens?\b/i,
  /\bconsent screen\b/i,
  /\bpkce\b/i,
  /\b(register|create|registering|creating) (an?|your|the) (oauth )?(app|application|client|integration)\b/i,
  /\bapp registration\b/i,
];

/** True when a page's text mentions OAuth or app-registration terms. Empty text never passes. */
export function mentionsOAuthTerms(text: string): boolean {
  return OAUTH_TERMS.some((term) => term.test(text));
}
