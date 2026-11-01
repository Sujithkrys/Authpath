# Comparison with the answer keys

The generator ran locally in compare mode on 1 November 2026, on the final research code, with `gemini-3.5-flash-lite` and no web search. Each result was graded by hand against [answer-keys.json](answer-keys.json), which was built separately from the official docs. Raw results are in [runs/final-comparison](runs/final-comparison).

## Overall

| | GitHub | Slack | Google |
|---|---|---|---|
| Difficulty | Easy | Easy | Hard (not fully confirmed) |
| Expected | Easy | Moderate | Hard, or Hard (not fully confirmed) |
| Match? | Yes | **No** | Yes |
| Time | 25.6s | 25.4s | 33.6s |
| Steps | 4 | 4 | 4 |
| Claims checked | 11 | 12 | 13 |
| Kept / downgraded / dropped | 10 / 1 / 0 | 9 / 2 / 1 | 9 / 4 / 0 |

## Checklist score

| | GitHub | Slack | Google | Average |
|---|---|---|---|---|
| Answered, of 10 | 7 | 7 | 9 | 7.7 |
| Fully confirmed by the checker | 6 | 6 | 6 | 6.0 |
| Partly confirmed | 1 | 1 | 3 | 1.7 |
| Empty, and the docs don't publish it either | 3 | 0 | 0 | |
| Missed: the docs have it | 0 | 3 | 1 | 1.3 |
| Wrong claims in the result | 0 | 0 | 0 | 0 |

## Checklist items

**Correct:** matches the key. **Partial:** right but incomplete. **Uncertain:** right, but the checker only partly accepted it. **Empty, correct:** the docs don't publish this. **Missed:** the docs have it and the agent didn't report it.

| Item | GitHub | Slack | Google |
|---|---|---|---|
| Where to register | Correct | Correct | Correct |
| App types | Correct | Missed; the checker removed the answer | Correct |
| Required fields | Correct | Missed | Correct |
| Redirect URI rules | Uncertain | Partial: HTTPS, not the `#` rule | Uncertain; HTTPS and exact match |
| Credentials | Correct, with PKCE | Uncertain, with PKCE | Correct |
| Scopes | Correct | Correct | Uncertain |
| Review | Correct | Correct | Uncertain |
| Published timeline | Empty, correct | Partial: the functional review part, word for word | Partial: brand review only |
| Test limits | Empty, correct | Missed | Correct: test users only |
| Rejection reasons | Empty, correct | Correct | Missed |

## Wrong results

| App | What's wrong | Why |
|---|---|---|
| Slack | Rated Easy; should be Moderate | It read the rate-limits page but reported no limits, so only the optional listing review counted |

No wrong claim about setup survived into these three guides. The checker removed one answer from Slack's result.

## Sources

No result cited a third-party site. Slack still cited one SDK tutorial page, for where to register, alongside its main docs.
