import { z } from "zod";

import { GATES } from "@/lib/agent/rules";
import { CHECKLIST, GENERATED_VERSION } from "@/types/guide";

/*
 * What each stage must submit. These become strict tool schemas, so they stay
 * inside what strict mode supports: every field required, and no length limits.
 */

const nullableUrl = z.string().nullable();

export const FindResult = z.object({
  outcome: z
    .enum(["found", "ambiguous", "not_found"])
    .describe("ambiguous: several different real products could be meant. not_found: no such app could be identified."),
  appName: z.string().describe("The product's proper name. Empty unless found."),
  officialDomains: z
    .array(z.string())
    .describe("Bare domains the provider itself runs for its site and docs, e.g. linear.app. No scheme, no path, no third parties."),
  docsUrls: z
    .array(z.string())
    .describe("Up to 5 official URLs: the developer docs home, the OAuth or authentication docs, and the product's home page."),
  options: z
    .array(z.object({ name: z.string(), description: z.string(), website: z.string() }))
    .describe("Only when ambiguous: the distinct products, each with a one-line description and its website."),
});
export type FindResult = z.infer<typeof FindResult>;

export const ClassifyResult = z.object({
  category: z
    .enum(["oauth_provider", "no_oauth", "platform", "unknown"])
    .describe(
      "oauth_provider: third-party developers register their own OAuth app with this provider to access its users' data. " +
        "no_oauth: only API keys or tokens, or no public API. " +
        "platform: it connects to other apps or manages auth for them (integration platforms, aggregators, unified APIs, iPaaS). " +
        "unknown: the pages read don't settle it.",
    ),
  evidenceUrl: nullableUrl.describe("The page you read that settles the category."),
  evidenceQuote: z
    .string()
    .nullable()
    .describe("A sentence copied word for word from evidenceUrl that shows the category. Null if none."),
  summary: z.string().describe("What the app is, in one or two plain, factual sentences. No marketing language or numbers of integrations."),
  authMethods: z
    .array(z.string())
    .describe(
      "How a developer's own code authenticates to THIS app's API, as the docs name it, e.g. 'Project API key', 'Server token'. Not the auth types it handles for other apps.",
    ),
  instead: z
    .string()
    .describe("Only when not oauth_provider: what a developer should do instead, in one or two sentences. Empty otherwise."),
});
export type ClassifyResult = z.infer<typeof ClassifyResult>;

/** Checklist items researched while reading the registration docs. */
export const READ_KEYS = ["register_url", "app_types", "required_fields", "redirect_uris", "credentials", "scopes"] as const;
/** Checklist items researched while checking approval. review_timeline is decided by the quote rule, not the model. */
export const APPROVAL_KEYS = ["review", "test_limits", "rejection_reasons"] as const;

const checklistItems = <K extends readonly [string, ...string[]]>(keys: K) =>
  z.array(
    z.object({
      key: z.enum(keys),
      status: z.enum(["found", "not_found"]).describe("not_found when no page you read answers it. Never fill a gap from memory."),
      answer: z
        .string()
        .describe("One or two short sentences, as the page states it. Wrap literal values (scope names, field names, URLs) in <code></code>. Empty when not_found."),
      sourceUrl: nullableUrl.describe("The page you read this on. Null when not_found."),
    }),
  );

export const ReadResult = z.object({
  developerConsoleUrl: nullableUrl.describe("The exact page where developers create the app, if the docs give it."),
  items: checklistItems(READ_KEYS).describe("One entry for each key."),
});
export type ReadResult = z.infer<typeof ReadResult>;

export const ApprovalResult = z.object({
  gate: z
    .enum(GATES)
    .describe(
      "What stands between a working app and real users connecting. none: self-serve, anyone can authorize it. " +
        "listing_only: review only for a public directory or marketplace listing. light_verification: light business or domain verification. " +
        "mandatory_review: every app needs review before real users can connect. security_assessment: a security assessment or audit is required (for some scopes, say which). " +
        "partner_program: a partner program is required. paid_plan: a paid plan is required. unknown: the pages don't say.",
    ),
  gateDetail: z.string().describe("At most 15 words on the gate, e.g. 'Restricted Gmail scopes require a security assessment'."),
  gateQuote: z.string().nullable().describe("A sentence copied word for word from gateUrl that shows the gate. Null if none."),
  gateUrl: nullableUrl.describe("The page gateQuote was copied from."),
  timelineLabel: z
    .string()
    .nullable()
    .describe("The published wait, carrying every number in evidenceQuote, e.g. '5 working days, then 5-10 working days'. Null unless stated."),
  evidenceQuote: z.string().nullable().describe("The sentence stating the timeline, copied word for word."),
  evidenceUrl: nullableUrl.describe("The page evidenceQuote was copied from."),
  items: checklistItems(APPROVAL_KEYS).describe("One entry for each key."),
});
export type ApprovalResult = z.infer<typeof ApprovalResult>;

const checklistKey = z.enum(CHECKLIST.map((item) => item.key) as [string, ...string[]]);

export const GuideDraft = z.object({
  steps: z
    .array(
      z.object({
        title: z.string().describe("Starts with an imperative verb. One action."),
        description: z.string().describe("One or two short sentences. <code> only around values someone pastes. No URLs."),
        owner: z.enum(["agent", "you"]),
        link: z
          .object({ label: z.string().describe("e.g. 'Open the developer console'"), url: z.string() })
          .nullable()
          .describe("Where to do this step, on the provider's own site. Null if none."),
        from: z.array(checklistKey).describe("The checklist items this step is built from."),
        sourceUrl: nullableUrl.describe("The source of the checklist item it rests on. Null if none."),
      }),
    )
    .min(1),
  blockers: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      sourceUrl: nullableUrl.describe("The page this blocker rests on, from the checklist."),
    }),
  ),
  agentTasks: z.array(z.string()).min(1).describe("Short tasks an agent can really do."),
  youTasks: z.array(z.string()).min(1).describe("Short tasks only the developer can do."),
});
export type GuideDraft = z.infer<typeof GuideDraft>;

export const VerifyResult = z.object({
  verdicts: z.array(
    z.object({
      id: z.string().describe("The claim id, exactly as given."),
      verdict: z.enum(["yes", "partly", "no"]),
    }),
  ),
});
export type VerifyResult = z.infer<typeof VerifyResult>;

/*
 * The finished results, checked before anything is saved. Deliberately tighter
 * than the types: "verified" and tested: true can't pass, because only a person
 * sets those, by hand, on library guides.
 */

const bareUrl = z
  .string()
  .min(1)
  .refine((value) => !value.includes("://"), "must not include a protocol");

const httpsUrl = z.url({ protocol: /^https$/ });
const source = z.tuple([z.string().min(1), bareUrl]);

export const GeneratedGuideSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: z.string().min(1),
    init: z.string().min(1).max(2),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    diff: z.enum(["easy", "moderate", "hard", "unknown"]),
    diffReason: z.string().min(1),
    tested: z.literal(false),
    generated: z.literal(true),
    generatedAt: z.iso.datetime(),
    version: z.literal(GENERATED_VERSION),
    setup: z.string().min(1),
    wait: z.string().min(1),
    review: z.string().min(1),
    site: bareUrl,
    steps: z
      .array(
        z
          .object({
            t: z.string().min(1),
            d: z.string().min(1),
            o: z.enum(["agent", "you"]),
            e: z.enum(["docs", "uncertain"]),
            source: httpsUrl.optional(),
            link: z.object({ label: z.string().min(1), url: httpsUrl }).optional(),
          })
          .refine((step) => step.e === "uncertain" || step.source, "a docs step needs a source"),
      )
      .min(1)
      .max(8),
    blockers: z.array(z.object({ b: z.string().min(1), s: z.string().min(1), source: httpsUrl.optional() })),
    agent: z.array(z.string().min(1)).min(1),
    you: z.array(z.string().min(1)).min(1),
    sources: z.array(source).min(1).max(6),
    otherPages: z.array(source),
    checklist: z
      .array(
        z
          .object({
            key: checklistKey,
            status: z.enum(["found", "uncertain", "not_found"]),
            answer: z.string(),
            source: httpsUrl.optional(),
          })
          .refine((item) => item.status !== "found" || item.source, "a found item needs a source")
          .refine((item) => item.status === "not_found" || item.answer.trim(), "an answered item needs an answer"),
      )
      .length(CHECKLIST.length),
    claimCheck: z.object({
      checked: z.number().int().min(0),
      kept: z.number().int().min(0),
      downgraded: z.number().int().min(0),
      dropped: z.number().int().min(0),
    }),
  })
  .strict();

export const AppCardSchema = z
  .object({
    kind: z.literal("card"),
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: z.string().min(1),
    category: z.enum(["no_oauth", "platform", "unknown"]),
    summary: z.string().min(1),
    authMethods: z.array(z.string().min(1)),
    instead: z.string().min(1),
    sources: z.array(source).min(1),
    generatedAt: z.iso.datetime(),
    version: z.literal(GENERATED_VERSION),
  })
  .strict();
