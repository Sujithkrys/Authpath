# Verification summary

This is how Authpath's guide generator was tested, what it got right, what it missed, what was corrected and what is still uncertain.

## The short version

On the final code, the generator matched the expected difficulty for GitHub and Google, but not Slack. It answered 23 of 30 checklist items across the three, and no wrong claim survived into a result. Slack came out Easy when it should be Moderate, and Xero's rating is not stable. Nobody has done these setups by hand, so all of this is checked against documentation only.

## What was tested, and how

| Test | What it does | Result |
|---|---|---|
| Answer keys | A separate researcher read the official docs for GitHub, Slack and Google and answered the 10 checklist items, quoting each page. See [answer-keys.json](answer-keys.json). | Done |
| Comparison | The generator ran on GitHub, Slack and Google on real Gemini, and each result was graded against its key. See [comparison.md](comparison.md). | 2 of 3 difficulty ratings correct |
| Live runs | Eight apps ran through the deployed site. See [consistency.md](consistency.md). | All 8 links load; Shopify needed a second try |
| Consistency | Apps ran repeatedly to see whether their answers stayed the same. | Stable for Composio, Postmark and Calendly; not for Xero |
| Fake-API tests | The whole app runs against fake Gemini, Anthropic and storage servers, covering each rule and failure. | 107, 101 and 92 checks passed across the three provider setups |
| Rule tests | Unit tests for difficulty, owner, writing, sources, keys and quota timing. | 113 of 113 passed |
| Interface tests | Library behaviour, overlap and sideways scroll at 375, 768 and 1440px. | All passed |

## What the agent got right

- **Classification.** Composio was an integration platform and Postmark had no OAuth in 11 of 11 runs each. Calendly was an OAuth provider every time.
- **Difficulty for GitHub and Google.** GitHub came out Easy. Google came out Hard (not fully confirmed), as expected.
- **Main docs.** Slack cited `installing-with-oauth` and `using-pkce`, and found the HTTPS rule and PKCE.
- **Published timelines.** Slack's and Google's were quoted word for word from the official pages.
- **Checking itself.** Across all 38 recorded guide runs, the checker kept 353 claims, downgraded 37 and dropped 9.
- **Sources.** Every cited page in the final comparison runs was on the provider's own docs site.

## What it missed

- **Slack's difficulty.** It came out Easy instead of Moderate. It read the rate-limits page but didn't report the limits on unlisted apps, so nothing moved it up from Easy.
- **Slack's items.** App types, required fields and development limits were not found.
- **Slack's redirect rule on `#`.** It found the HTTPS rule but not this one.
- **Google's rejection reasons,** and its timelines for sensitive and restricted scopes. Only the brand review timeline was found.

## What was corrected

The full list, with causes, is in [problems-found-and-fixed.md](problems-found-and-fixed.md). The biggest fixes:

- **The model now reads the page text we check it against.** Before this it read pages through a tool we couldn't see into, which gave lazy answers and quotes that didn't match.
- **Difficulty is decided by rules in code.** The model only reports what the pages show. The strictest gate with a supporting quote decides the rating.
- **"Unknown" now means no supporting quote at all.** A real quote the checker only partly accepts gives a best estimate, labelled "not fully confirmed".
- **Main docs come first.** SDK tutorials, quickstarts and sample apps rank below the main OAuth and registration pages.
- **Result cards must cite API authentication pages,** never account login or two-factor help articles.
- **Library guides no longer claim hands-on testing.** GitHub and Slack are marked "From provider docs", because nobody has created those OAuth apps yet.

## What's still uncertain

- **Xero.** Its rating has varied between Unknown, Moderate and Hard. The latest is Hard, because it treats the security assessment as required. Xero's assessment appears tied to app-partner certification, so Moderate may be right. It has no answer key.
- **Slack's rating depends on one fact being reported.** It can vary until the model reliably reports the limits on unlisted apps.
- **Shopify failed once.** Its first run stopped because the writer broke the writing rules three times. The second run worked.
- **Easy by absence.** Calendly, Linear and Dropbox are Easy because registration is self-serve and the review pages read describe no review. That's an inference from what the docs don't say. Dropbox and Linear have no answer keys.
- **Docs that need JavaScript.** Pages like these can't be read as text, so guides for those providers will be thin.
- **Hands-on truth.** Everything here is checked against documentation. Nobody has registered these apps and completed the flows.
- **The final UI.** The verdict line and "What you'll need" use stored data and don't change what the agent generates.
