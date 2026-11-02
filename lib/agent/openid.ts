/**
 * The provider's OpenID discovery file (/.well-known/openid-configuration): a
 * machine-readable file it publishes itself, giving the authorization endpoint,
 * the token endpoint and the scopes it supports. When it exists it's a strong
 * source for those; when it doesn't, nothing is shown.
 */

import type { FetchedPage } from "@/lib/agent/evidence";
import { baseDomain } from "@/lib/agent/sources";
import { hostOf, isUnder } from "@/lib/agent/urls";
import type { OpenIdDiscovery } from "@/types/guide";

const DISCOVERY_PATH = "/.well-known/openid-configuration";
const TIMEOUT_MS = 5_000;
const MAX_CANDIDATES = 8;
const MAX_SCOPES = 30;

/** Hosts of auth endpoints a docs page mentions, e.g. identity.xero.com in https://identity.xero.com/connect/authorize. */
export function authHostsIn(text: string): string[] {
  const hosts = [...text.matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})\/[^\s"'<>)\]]*?(authori[sz]e|oauth|token|connect|openid)/gi)].map((match) => match[1].toLowerCase());
  return [...new Set(hosts)];
}

/** Where to look: the provider's domains, www., and auth hosts found while reading, all under the provider's own domains. */
export function discoveryCandidates(domains: string[], extraHosts: string[]): string[] {
  const bases = [...new Set(domains.map(baseDomain))];
  const onProvider = (host: string) => bases.some((base) => isUnder(host, base));
  const hosts = [...domains, ...bases, ...bases.map((base) => `www.${base}`), ...extraHosts].map((host) => host.toLowerCase().replace(/\/.*$/, ""));
  return [...new Set(hosts.filter(onProvider))].slice(0, MAX_CANDIDATES).map((host) => `https://${host}${DISCOVERY_PATH}`);
}

/** A valid discovery file: an https authorization endpoint on the provider's own domain. The token endpoint is used when it has one too. */
export function parseDiscovery(url: string, body: unknown, domains: string[]): OpenIdDiscovery | null {
  if (!body || typeof body !== "object") return null;
  const file = body as Record<string, unknown>;
  const bases = [...new Set(domains.map(baseDomain))];
  const ours = (value: unknown): value is string => {
    if (typeof value !== "string" || !value.startsWith("https://")) return false;
    const host = hostOf(value);
    return Boolean(host && bases.some((base) => isUnder(host, base)));
  };
  if (!ours(file.authorization_endpoint)) return null;
  const scopes = Array.isArray(file.scopes_supported) ? file.scopes_supported.filter((scope): scope is string => typeof scope === "string" && scope.trim() !== "") : [];
  return {
    url,
    authorizationEndpoint: file.authorization_endpoint,
    ...(ours(file.token_endpoint) ? { tokenEndpoint: file.token_endpoint } : {}),
    scopes: scopes.slice(0, MAX_SCOPES),
  };
}

/** The file as text, so claims resting on it are checked like any page. */
export function discoveryPage(found: OpenIdDiscovery): FetchedPage {
  // Plain words next to each field, so the "is this page about OAuth" test and the checker read it like a page.
  const text = [
    "OpenID discovery file for OAuth 2.0 and OpenID Connect.",
    `Authorization endpoint (authorization_endpoint): ${found.authorizationEndpoint}`,
    found.tokenEndpoint ? `Token endpoint (token_endpoint): ${found.tokenEndpoint}` : "",
    found.scopes.length > 0 ? `Supported scopes (scopes_supported): ${found.scopes.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { url: found.url, title: "OpenID discovery file", text, via: "openid_discovery" };
}

/** The first discovery file that loads and is valid, or null. Never throws. */
export async function findOpenIdDiscovery(domains: string[], extraHosts: string[], signal: AbortSignal): Promise<OpenIdDiscovery | null> {
  const candidates = discoveryCandidates(domains, extraHosts);
  const results = await Promise.all(
    candidates.map(async (url) => {
      try {
        const response = await fetch(url, {
          headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; Authpath docs checker)" },
          signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
        });
        if (!response.ok) return null;
        return parseDiscovery(url, await response.json(), domains);
      } catch {
        return null;
      }
    }),
  );
  return results.find(Boolean) ?? null;
}
