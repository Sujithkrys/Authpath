# Verification summary

This is how Authpath's guide generator was tested, what it got right, what it missed, what was corrected and what is still uncertain.

**One thing to read first.** The real-model tests below ran before the last round of changes (the new difficulty rule, the main-docs ranking and the card relevance check). Google's free daily quota ran out before those changes could be tried on real Gemini. They have passed the fake-API tests and were checked against the real docs pages, but no real model has used them yet. The [repeat runs](#repeat-runs-still-to-do) are listed at the end.

## What was tested, and how

| Test | What it does | Result |
|---|---|---|
| Answer keys | A separate researcher read the official docs for GitHub, Slack and Google and answered the 10 checklist items, quoting each page. See [answer-keys.json](answer-keys.json). | Done |
| Comparison | The generator ran on GitHub, Slack and Google, and each result was graded against its key. See [comparison.md](comparison.md). | Done before the last changes |
| Consistency | Composio, Calendly and Postmark ran 3 times each to see whether the answers stayed the same. See [consistency.md](consistency.md). | Done before the last changes, one Calendly run short |
| Live runs | Calendly, Xero, Postmark and Composio ran on the deployed site. Raw results are in [runs/live](runs/live). | Done before the last changes |
| Fake-API tests | The whole app runs against fake Gemini, Anthropic and storage servers, covering each rule and failure. | 107, 101 and 92 checks passed across the three provider setups |
| Rule tests | Unit tests for difficulty, owner, writing, sources, keys and quota timing. | 113 of 113 passed |
| Interface tests | Library behaviour, name and tag overlap at 13 widths, and sideways scroll at 375, 768 and 1440px. | 53 of 53 passed |
| Real-page check | The new ranking ran on the real Slack, GitHub, Google and Postmark docs with no model calls, to see which pages it picks. | Picks the main pages (details below) |

## What the agent got right

- **Classification.** Composio came out as an integration platform and Postmark as no OAuth in 3 of 3 runs each. Calendly came out as an OAuth provider every time.
- **Published timelines.** Slack's review timeline and Xero's assessment timeline were quoted word for word from the official pages. Xero's wait now includes both parts of its timeline, which an earlier version undercounted.
- **Setup basics.** GitHub's registration path and required fields, Slack's registration flow, and Google's exact-match redirect rule all matched the answer keys.
- **Catching itself.** The checker marked GitHub's "HTTPS is required" claim as uncertain. The official docs don't state that.
- **Sources.** In the final comparison runs every cited page was on the provider's own docs site.

## What it missed

- **Slack:** app types, PKCE, the HTTPS and no-`#` redirect rules, and the rate limits for apps outside the Marketplace.
- **Google:** rejection reasons, and the published timelines for sensitive and restricted scopes. Test-user limits were found in some runs but not all.
- **Difficulty:** Google came out Unknown when the key says Hard. GitHub came out Moderate when the new rule says Easy.
- **Depth:** answers are often correct but thinner than the docs, because they're limited to one or two short sentences.

## What was corrected

The full list, with causes, is in [problems-found-and-fixed.md](problems-found-and-fixed.md). The biggest fixes:

- **The model now reads the page text we check it against.** Before this it read pages through a tool we couldn't see into, which gave lazy answers and quotes that didn't match.
- **Difficulty is decided by rules in code.** The model only reports what the pages show. The strictest gate with a supporting quote decides the rating.
- **"Unknown" now means no supporting quote at all.** A real quote the checker only partly accepts gives a best estimate, labelled "not fully confirmed".
- **Main docs come first.** SDK tutorials, quickstarts and sample apps rank below the main OAuth and registration pages.
- **Result cards must cite API authentication pages,** never account login or two-factor help articles.
- **Library guides no longer claim hands-on testing.** GitHub and Slack are marked "From provider docs", because nobody has created those OAuth apps yet.

## What's still uncertain

- **The new difficulty rule hasn't met a real model.** The fake-API tests prove the rule behaves correctly on given evidence. They can't prove Gemini will report the right evidence for GitHub, Slack and Google.
- **Slack's limits and PKCE.** The right pages now get read: `installing-with-oauth`, `using-pkce`, `rate-limits` and `distribution`. Whether the model picks up each fact is unconfirmed. If it misses the rate limits, Slack would come out Easy instead of Moderate.
- **Slack's "no fragments" rule.** The word "fragment" isn't on the main OAuth page. The answer key's wording is about `#`, so this one depends on the model reading it correctly.
- **Consistency of the new rule.** Earlier runs varied from one run to the next, and each cause was fixed, but the new rule has not been run three times on real Gemini.
- **Easy by absence.** Calendly is rated Easy because registration is self-serve and the review pages read describe no review. That's an inference from what the docs don't say, not a statement from Calendly.
- **Docs that need JavaScript.** Pages like these can't be read as text, so guides for those providers will be thin. They can only be partly checked.
- **Hands-on truth.** Everything here is checked against documentation. Nobody has registered these apps and completed the flows.

## Repeat runs still to do

Run these after the daily quota resets at midnight Pacific.

**Locally, in compare mode, with `GEMINI_API_KEY_DEV`:**

| App | Runs | What should happen |
|---|---|---|
| GitHub | 1 | Easy |
| Slack | 1 | Moderate; cites `installing-with-oauth`; finds HTTPS and PKCE |
| Google OAuth | 1 | Hard, or Hard (not fully confirmed) |
| Calendly | 3 | Easy each time |
| Xero | 3 | Moderate each time, if its connection cap is found |
| Postmark | 1 | No OAuth; sources are API pages only |

**On the live site, after adding the new project's key to Vercel:**

| App | Runs | What should happen |
|---|---|---|
| Calendly, Xero, Postmark, Composio | 1 each, using `npm run warm-cache` | Same as above; Composio stays an integration platform |

The result format changed, so every saved live result needs regenerating.
