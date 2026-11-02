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
  /(^|\/)(blog|blogs|content|use-?cases?|pricing|plans|customers?|customer-stories|case-stud(y|ies)|news|newsroom|press|webinars?|events?|podcasts?|videos?|glossary|changelog|release-notes|careers|jobs|legal|privacy|terms|tos|cookies?|about|company|compare|vs|alternatives?|templates|community|forum|forums|status|now|stories|ebooks?|whitepapers?|resources|academy|login|signin|sign-in|signup|sign-up|register-account|demo|contact-sales|affiliates?|brand|tag|tags|author|authors|category|categories|pulls?|issues|commits?|blob|tree|discussions|gists?|sponsors|legacy|deprecated|archived?)(\/|$|\.)/i;

/** Paths that are marketing on a company's main site, but can be real docs on a docs subdomain. */
const MARKETING_ON_MAIN_SITE = /(^|\/)(integrations?|solutions?|features?|products?|apps|partners?|marketplace|industries|tools?)(\/|$)/i;

/** API reference pages for single endpoints: /reference/..., or dotted method names like invoices.approve. */
const ENDPOINT_REFERENCE = /(^|\/)(api-?reference|reference|endpoints?|methods?)\/|\/[a-z]+\.(?!(html?|php|aspx?|md)$)[a-z][a-z.]*$/i;
const AUTH_PATH = /oauth|auth|scope|token|permission|consent|redirect|(^|[/\-_.])apps?([/\-_.]|$)/i;

const ASSET = /\.(png|jpe?g|svg|gif|webp|css|js|ico|woff2?|xml|zip|json|txt|mp4|webm)$/i;

/** Tutorials built around a third-party tool, whose example values (e.g. Postman's callback URL) aren't yours. */
const THIRD_PARTY_TOOL_PAGE = /(^|[/\-_.])(postman|insomnia|zapier|n8n|ifttt|pipedream|retool)([/\-_.]|$)/i;

/**
 * One API endpoint's reference page, e.g. /api-docs/.../post-oauth-revoke. They
 * never hold setup steps, so they aren't worth the extra ways of reading.
 */
export function isEndpointReferencePage(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase().replace(/\/$/, "");
    const last = path.split("/").at(-1) ?? "";
    return /^(get|post|put|patch|delete|list)-[a-z0-9-]+$/.test(last) || /(^|\/)(api-?reference|reference)\//.test(path);
  } catch {
    return false;
  }
}

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

/** SDK tutorials, quickstarts, sample apps and per-platform SDK pages: useful, but never ahead of the provider's main docs. */
const SECONDARY_PAGE =
  /(^|\/)(tools|sdks?|libraries|client-libraries|bolt(-[a-z]+)?|samples?|examples?|tutorials?|quickstarts?|codelabs?|how-?tos?|cookbooks?|recipes|walkthroughs?|articles?|article|ios|android|unity|react-native|flutter|xamarin|macos|tvos|watchos)(\/|$)|(^|[/\-_])(tutorial|quickstart|sample|example)s?([/\-_.]|$)/i;

/** The main OAuth reference and app-registration pages, whatever the provider calls them. */
const MAIN_PAGE =
  /(^|\/)(oauth2?|authentication|authorization|authorizing|scopes?|pkce|using-pkce)(\/?$)|(creat|regist|install|authoriz|authenticat|using)[a-z]*-[a-z0-9-]*(oauth|apps?\b|pkce)|oauth[a-z0-9-]*-(creat|regist|flow|install|guide|app)|(^|[/\-])(web-server|redirect|consent|production-readiness|verification)([/\-]|$)|(^|\/)(manual|login|auth|code|authorization-code)-flow\/?$/i;

/** Weighs a page by what kind it is: main docs first, reference and tutorials later. */
export function pageWeight(url: string): number {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase().replace(/\/$/, "");
  } catch {
    return 0;
  }
  const secondary = SECONDARY_PAGE.test(path) || /(^|\/)(reference)\//.test(path);
  if (secondary) return 0.25;
  if (!MAIN_PAGE.test(path)) return 1;
  // A page whose own slug says OAuth beats a sibling about another app type.
  return /oauth/.test(path.split("/").at(-1) ?? "") ? 3 : 2;
}

/** Account login and email-setup help: about signing in to the product, never about authenticating to its API. */
const ACCOUNT_HELP_PAGE =
  /(^|[/\-_])(two-factor|2fa|mfa|password|passwords|saml|sso|login|log-in|signin|sign-in|dkim|spf|dmarc|billing|invoices?)([/\-_.]|$)|manage-your-[a-z0-9-]*account/i;

/**
 * A login product developers build on, such as Facebook Login (/facebook-login/),
 * "Sign in with Apple" or "Login with Amazon". These are the OAuth docs
 * themselves, not help with signing in to an account.
 */
const LOGIN_PRODUCT_PAGE = /(^|\/)((?!(account|user|customer|member|admin|troubleshoot)-)[a-z]+-(login|sign-in)|(login|sign-in)-with-[a-z-]+)(\/|$)/i;

export function isAccountHelpPage(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return ACCOUNT_HELP_PAGE.test(path) && !LOGIN_PRODUCT_PAGE.test(path);
  } catch {
    return false;
  }
}

/** Locale path segments for translated copies of docs. English copies are kept. */
const OTHER_LOCALES = new Set(
  "es fr de ja ko pt pt-br pt-pt zh zh-cn zh-tw zh-hans zh-hant ru it nl pl tr id vi th sv da fi nb no cs he ar uk hu ro el es-419 es-es fr-fr de-de ja-jp ko-kr".split(" "),
);

/** True for a translated copy of a page, e.g. docs.github.com/es/..., which would only repeat the English one. */
export function isLocaleVariant(url: string): boolean {
  try {
    // Anywhere in the path (docs.slack.dev/tools/bolt-js/ja-jp/..., docs.github.com/es/...),
    // or a language parameter that isn't English (cloud.google.com/...?hl=fr).
    const parsed = new URL(url);
    const lang = ["hl", "lang", "locale", "language"].map((name) => parsed.searchParams.get(name)).find(Boolean);
    if (lang && !/^en([-_]|$)/i.test(lang)) return true;
    return parsed.pathname
      .split("/")
      .filter(Boolean)
      .some((segment) => OTHER_LOCALES.has(segment.toLowerCase()));
  } catch {
    return false;
  }
}

/** First path segments that mark docs on a company's main site, e.g. linear.app/developers. */
const DOCS_SEGMENT =
  /^(docs?|documentation|developers?|dev|api|apis|help|support|reference|learn|platform|kb|hc|authentication|oauth2?|auth)$/i;

/**
 * Whether a link found on a page is worth reading. On a docs subdomain any page
 * is; on the main site only docs-like sections are, because main sites also
 * host user content (github.com/someone/repo) and marketing.
 */
export function isDiscoverable(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  if (isAccountHelpPage(url)) return false;
  if (isDocsHost(host)) return true;
  const first = new URL(url).pathname.split("/").filter(Boolean)[0] ?? "";
  return first === "" || DOCS_SEGMENT.test(first);
}

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
  // llms.txt and llms-full.txt are the docs site's own plain-text copies, not assets.
  if (/^\/llms(-full)?\.txt$/.test(path)) return true;
  if (ASSET.test(path) || BLOCKED_PATH.test(path) || THIRD_PARTY_TOOL_PAGE.test(path)) return false;
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

/** Words that show a page is about authenticating to an API. */
const API_AUTH_TERMS: RegExp[] = [
  /\bapi[ _-]?(key|token)s?\b/i,
  /\b(server|account|access|bearer|project|personal|secret|auth(entication)?) (api )?(tokens?|keys?)\b/i,
  /\bauthorization header\b/i,
  /\bx-[a-z0-9-]*(token|key|auth)[a-z0-9-]*\b/i,
  /\bbasic auth(entication)?\b/i,
];

/**
 * The test for pages a result card cites: about authenticating to the API
 * (keys, tokens, auth headers), not an account login or two-factor help article.
 */
export function isApiAuthPage(url: string, text: string): boolean {
  if (isAccountHelpPage(url)) return false;
  return API_AUTH_TERMS.some((term) => term.test(text)) || mentionsOAuthTerms(text);
}

/** Words that show a page is about reviewing, certifying or listing apps. */
const APPROVAL_TERMS: RegExp[] = [
  /\b(app|apps|application|applications|integration|integrations)\b.{0,40}\b(review|reviews|reviewed|verification|verified|certif(y|ied|ication)|listing|listed|submission|submit|assessment|approval|approved)\b/i,
  /\b(review|verification|certification|listing|submission|assessment|approval)\b.{0,40}\b(app|apps|application|applications|integration|integrations)\b/i,
  /\b(marketplace|app store|app directory|app partners?|developer partners?)\b/i,
  /\bsecurity (review|assessment|requirements?)\b/i,
];

/**
 * The test for pages behind review, timeline, test-limit and rejection answers,
 * gate claims and blockers: OAuth terms, or app-review terms, since a provider's
 * security-assessment page needn't mention client IDs. Empty text never passes.
 */
export function mentionsApprovalTerms(text: string): boolean {
  return mentionsOAuthTerms(text) || APPROVAL_TERMS.some((term) => term.test(text));
}
