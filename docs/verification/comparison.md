# Comparison with the answer keys

The generator ran locally in compare mode on 1 November 2026, using `gemini-3.5-flash-lite` with no web search. Each result was graded by hand against [answer-keys.json](answer-keys.json), which was built separately from the official docs. Raw results are in [runs/final](runs/final).

These runs predate the new difficulty rule and the main-docs ranking. The "new rule" row says what each app should get now; see the [summary](summary.md) for the repeat runs.

## Overall

| | GitHub | Slack | Google |
|---|---|---|---|
| Time | 17.5s | 26.3s | 32.1s |
| Steps | 4 | 4 | 5 |
| Claims checked | 11 | 12 | 14 |
| Kept / downgraded / dropped | 7 / 4 / 0 | 12 / 0 / 0 | 9 / 4 / 1 |
| Difficulty at the time | Moderate | Moderate | Unknown |
| Answer key's rating | Easy | Moderate | Hard |
| Under the new rule | Should be Easy | Should be Moderate | Should be Hard, or Hard (not fully confirmed) |

## Checklist items

**Correct:** the answer matches the key. **Partial:** right but incomplete. **Uncertain:** the checker only partly accepted it. **Empty, correct:** the docs don't publish this, and the agent said so. **Missed:** the docs have it and the agent didn't find it.

| Item | GitHub | Slack | Google |
|---|---|---|---|
| Where to register | Correct | Correct | Uncertain; right console |
| App types | Uncertain; right content | Missed | Correct |
| Required fields | Correct | Correct | Partial: name and branding, no support email or domains |
| Redirect URI rules | Uncertain; 10 URLs right, HTTPS claim wrong | Partial: where to add them, not the rules | Correct on exact match; no localhost or wildcard rules |
| Credentials | Uncertain; right content | Partial: client ID only, no PKCE | Correct; doesn't say the secret is shown once |
| Scopes | Correct | Correct | Uncertain; right content |
| Review | Correct | Correct | Uncertain; right content |
| Published timeline | Empty, correct | Correct, word for word | Partial: brand review only |
| Test limits | Empty, correct | Missed | Missed in this run, found in an earlier one |
| Rejection reasons | Empty, correct | Correct | Missed |

## Wrong claims

| App | Claim | What happened |
|---|---|---|
| GitHub | "HTTPS is required when wildcard matching is disabled" | The official docs don't state this. The checker marked it uncertain. |
| Slack | None in the final run | An earlier run told readers to add Postman's callback URL, copied from a tutorial. Fixed. |
| Google | None found | |

## Wrong or non-official sources

No result cited a third-party site. Two weaker choices appeared:

- Slack's setup answers came from SDK tutorial pages rather than its main OAuth page. The new ranking addresses this.
- Earlier GitHub runs cited GitHub App pages for OAuth app questions. The new ranking prefers pages with "oauth" in the name.

## Real-page ranking check

This ran after the ranking change, on the real docs sites, with no model calls.

| Site and stage | Pages it now picks first |
|---|---|
| Slack, setup | `authentication/installing-with-oauth`, `authentication/using-pkce`, `authentication/` |
| Slack, approval | `slack-security-review`, `apis/web-api/rate-limits`, `slack-marketplace-review-guide`, `app-management/distribution` |
| Google, approval | `sensitive-scope-verification`, `restricted-scope-verification`, `brand-verification` |
| Postmark, classification | `developer/api/email-api`, `stats-api`, `bounce-api`, `server-api` |

Slack's main OAuth page does contain "The redirect_uri must use HTTPS." A Postmark two-factor help article now fails the card check.
