# Consistency and live runs

All runs were on 1 November 2026, using the free Gemini tier. They predate the new difficulty rule, so the ratings below follow the old one. Raw results are in [runs](runs).

## Consistency

| App | Run 1 | Run 2 | Run 3 | Same every time? |
|---|---|---|---|---|
| Composio | Integration platform | Integration platform | Integration platform | Yes |
| Postmark | No OAuth | No OAuth | No OAuth | Yes |
| Calendly | OAuth provider, Easy | OAuth provider, Easy | Stopped by the daily quota | Yes for the 2 that finished |

Calendly was also Easy in all 3 runs of the set just before ([runs/calendly-before-last-fixes](runs/calendly-before-last-fixes)).

### What changed along the way

- **Calendly first varied: Unknown, Easy, Easy.** Sometimes the approval stage never read the registration page, and the rating followed the model's pick. The approval stage now always reads that page, and code decides the rating.
- **Xero varied between Moderate and Unknown,** depending on how the model worded its review answer. The rating now rests on quoted evidence, not wording. This hasn't been repeated on a real model.
- **Slack varied between Moderate and Unknown** for the same reason.

## Live runs on the deployed site

| App | Category | Difficulty | Steps | Uncertain | Kept / downgraded / dropped | Time |
|---|---|---|---|---|---|---|
| Calendly | OAuth provider | Easy | 5 | Scopes step and item | 8 / 2 / 0 | 20.0s |
| Xero | OAuth provider | Moderate | 3 | None | 9 / 0 / 0 | 15.8s |
| Postmark | No OAuth | n/a | n/a | n/a | n/a | 12.6s |
| Composio | Integration platform | n/a | n/a | n/a | n/a | 13.8s |

Cards don't go through the checker, because they have no steps or checklist.

## "Unknown" results across all saved runs

There were 12 Unknown difficulties in 54 finished results: Google 4, Xero 4, GitHub 2, Slack 1, Calendly 1.

| Cause | Count |
|---|---|
| A real quote was found on the page, but the checker said "partly" or "no" | 10 |
| The model gave no gate at all | 1 |
| The page had no OAuth terms, so its quote was thrown out | 1 |

The word-for-word quote rule caused none of these. Under the new rule, the "partly" cases show a best estimate labelled "not fully confirmed" instead.

Two category Unknowns happened earlier, before those run sets. Slack's came from its docs moving to a new domain. Composio's came from the model paraphrasing its quote, which was fixed by giving it the real page text; the rule itself didn't change.

## Free-tier limits hit

- Per-minute 429 errors.
- "High demand" 503 errors on `gemini-3.5-flash-lite`, `gemini-3.5-flash` and `gemini-3.6-flash`.
- Calls that stalled for 60 seconds on `gemini-3.5-flash-lite` and `gemini-3.8-flash`. Two Calendly runs hit the 270-second limit this way.
- The daily quota, at the end of the session.
