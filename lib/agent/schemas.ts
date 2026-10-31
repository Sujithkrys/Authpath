import { z } from "zod";

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
    .describe("Bare domains the provider itself runs for docs, e.g. linear.app. No scheme, no path, no third parties."),
  docsUrls: z
    .array(z.string())
    .describe("Up to 5 official developer or OAuth docs URLs, copied exactly from search results."),
  options: z
    .array(z.object({ name: z.string(), description: z.string(), website: z.string() }))
    .describe("Only when ambiguous: the distinct products, each with a one-line description and its website."),
});
export type FindResult = z.infer<typeof FindResult>;

export const ReadResult = z.object({
  supportsOAuth: z
    .enum(["yes", "no", "unclear"])
    .describe("no: the docs show third-party OAuth isn't offered. unclear: the pages read don't settle it."),
  authEvidenceUrl: nullableUrl.describe("The fetched page that settles supportsOAuth."),
  otherAuthMethods: z.array(z.string()).describe("Auth the docs describe besides OAuth, e.g. API keys."),
  summary: z.string().describe("One or two sentences on how auth works for this app."),
  developerConsoleUrl: nullableUrl.describe("Where developers create the app, if the docs give it."),
  facts: z.array(
    z.object({
      topic: z.enum(["where_to_create", "required_fields", "redirect_uri", "scopes", "credentials", "other"]),
      claim: z.string().describe("One specific fact, stated as the docs state it."),
      sourceUrl: z.string().describe("The fetched page this fact came from."),
    }),
  ),
});
export type ReadResult = z.infer<typeof ReadResult>;

export const ApprovalResult = z.object({
  reviewRequired: z
    .enum(["yes", "no", "conditional", "unknown"])
    .describe("no only if the docs say so outright. unknown if they don't say."),
  reviewLabel: z.string().describe("At most 3 words for when review applies, e.g. 'Marketplace only', 'No', 'Unclear'."),
  summary: z.string().describe("One or two sentences on what review involves."),
  processes: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      sourceUrl: z.string().describe("The fetched page describing this process."),
    }),
  ),
  timelineLabel: z
    .string()
    .nullable()
    .describe("A short published wait, e.g. '2-4 weeks'. Null unless the docs state a timeline."),
  evidenceQuote: z
    .string()
    .nullable()
    .describe("Copied word for word from a fetched page: the published timeline, or the statement that no review exists."),
  evidenceUrl: nullableUrl.describe("The fetched page that evidenceQuote was copied from."),
});
export type ApprovalResult = z.infer<typeof ApprovalResult>;

export const GuideDraft = z.object({
  difficulty: z.enum(["easy", "moderate", "hard"]),
  steps: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().describe("Plain text. Wrap literal values such as URLs in <code></code>. No other markup."),
        owner: z.enum(["agent", "you"]),
        evidence: z.enum(["docs", "uncertain"]),
        sourceUrl: nullableUrl.describe("The fetched page this step rests on. Null means uncertain."),
      }),
    )
    .min(1),
  blockers: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      sourceUrl: nullableUrl.describe("The fetched page this blocker rests on."),
    }),
  ),
  agentTasks: z.array(z.string()).min(1).describe("Short tasks an agent can really do."),
  youTasks: z.array(z.string()).min(1).describe("Short tasks only the developer can do."),
});
export type GuideDraft = z.infer<typeof GuideDraft>;

/*
 * The finished guide, checked before anything is saved. It is deliberately
 * tighter than the Guide type: "verified" and tested: true can't pass, because
 * only a person sets those, by hand, on library guides.
 */

const bareUrl = z
  .string()
  .min(1)
  .refine((value) => !value.includes("://"), "must not include a protocol");

const httpsUrl = z.url({ protocol: /^https$/ });

export const GeneratedGuideSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: z.string().min(1),
    init: z.string().min(1).max(2),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    diff: z.enum(["easy", "moderate", "hard"]),
    tested: z.literal(false),
    generated: z.literal(true),
    generatedAt: z.iso.datetime(),
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
          })
          .refine((step) => step.e === "uncertain" || step.source, "a docs step needs a source"),
      )
      .min(1),
    blockers: z.array(z.object({ b: z.string().min(1), s: z.string().min(1), source: httpsUrl.optional() })),
    agent: z.array(z.string().min(1)).min(1),
    you: z.array(z.string().min(1)).min(1),
    sources: z.array(z.tuple([z.string().min(1), bareUrl])).min(1),
  })
  .strict();
