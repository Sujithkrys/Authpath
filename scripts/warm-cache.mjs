#!/usr/bin/env node
/**
 * Generates and caches a list of apps ahead of a demo, through the live site, so
 * it uses the live key and fills the same store visitors read from.
 *
 *   npm run warm-cache                       the apps in scripts/warm-cache-apps.txt
 *   npm run warm-cache -- Linear Calendly    just these apps
 *   npm run warm-cache -- --gap 90           seconds between generations (default 60)
 *   npm run warm-cache -- --base http://localhost:3000
 *
 * A guide uses about 9 model calls in under a minute, so one per minute stays
 * under per-minute limits. Apps cached in the last 7 days cost nothing. Each new
 * generation counts towards the site's hourly limit per IP (20 by default). It
 * stops if the daily quota runs out, and running it again picks up where it left off.
 */
import { readFileSync } from "node:fs";

const DEFAULT_BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://authpath-sujith.vercel.app";
const LIST = new URL("./warm-cache-apps.txt", import.meta.url);

function parseArgs(argv) {
  const options = { base: process.env.WARM_CACHE_BASE ?? DEFAULT_BASE, gapSeconds: 60, apps: [] };
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--base") options.base = argv[++index];
    else if (argv[index] === "--gap") options.gapSeconds = Number(argv[++index]);
    else options.apps.push(argv[index]);
  }
  if (!Number.isFinite(options.gapSeconds) || options.gapSeconds < 0) throw new Error("--gap needs a number of seconds");
  return options;
}

const appsFromFile = () =>
  readFileSync(LIST, "utf8")
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean);

/** Runs one generation and returns its last event. */
async function generate(base, input) {
  const response = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input }),
  });
  if (!(response.headers.get("content-type") ?? "").includes("ndjson")) {
    return { type: "blocked", message: `the site answered ${response.status} with a page, not a result` };
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let last = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines.filter(Boolean)) last = JSON.parse(line);
  }
  return last ?? { type: "error", message: "the stream ended with nothing" };
}

function describe(event) {
  switch (event.type) {
    case "guide":
      return `generated guide (${event.guide.diff}, ${event.guide.steps.length} steps) /guides/${event.slug}`;
    case "card":
      return `generated card (${event.card.category}) /guides/${event.slug}`;
    case "cached":
      return `already cached /guides/${event.slug}`;
    case "redirect":
      return `in the library /guides/${event.slug}`;
    case "ambiguous":
      return `ambiguous: use one of ${event.options.map((option) => option.name).join(", ")}`;
    default:
      return event.message ?? event.type;
  }
}

const wait = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

const options = parseArgs(process.argv.slice(2));
// Saved results linked from outside the site. They must never be generated again.
const PROTECTED = new Set(["calendly", "composio", "postmark"]);
const isProtected = (app) => PROTECTED.has(app.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[./\s]/)[0]);
const requested = options.apps.length > 0 ? options.apps : appsFromFile();
const skipped = requested.filter(isProtected);
if (skipped.length > 0) console.log(`Skipping protected apps: ${skipped.join(", ")}
`);
const apps = requested.filter((app) => !isProtected(app));
console.log(`Warming ${apps.length} apps on ${options.base}, at most one new generation every ${options.gapSeconds}s\n`);

let failed = 0;
for (const [index, app] of apps.entries()) {
  const started = Date.now();
  const event = await generate(options.base, app).catch((error) => ({ type: "error", message: String(error) }));
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${`[${index + 1}/${apps.length}]`.padEnd(8)} ${app.padEnd(24)} ${seconds.padStart(6)}s  ${describe(event)}`);

  if (event.type === "paused") {
    console.log(`\nStopped: the daily quota is gone until ${new Date(event.resumesAt).toLocaleString()}. Run this again after that.`);
    process.exit(1);
  }
  if (event.type === "blocked") {
    console.log("\nStopped: Vercel's firewall may be challenging scripted requests. Wait a while, or try again from another network.");
    process.exit(1);
  }
  if (event.type === "error") {
    failed++;
    if (/limit of \d+ guides an hour/.test(event.message)) {
      console.log("\nStopped: this IP reached the hourly limit. Run this again later; finished apps are skipped.");
      process.exit(1);
    }
  }

  // Cached and library apps use no model calls, so only real generations are paced.
  const generated = event.type === "guide" || event.type === "card";
  const remaining = options.gapSeconds - (Date.now() - started) / 1000;
  if (generated && remaining > 0 && index < apps.length - 1) await wait(remaining);
}

console.log(failed ? `\nDone, with ${failed} failed. Run this again to retry them.` : "\nDone.");
process.exit(failed ? 1 : 0);
