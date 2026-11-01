# Live runs and consistency

All runs were on 1 November 2026, on the free Gemini tier. Raw results are in [runs](runs).

## Live warm-cache run on the final research code

The apps ran through `npm run warm-cache` on the deployed site, at most one new generation every 90 seconds. See [warm-cache-output.txt](warm-cache-output.txt) and [live-pages.json](live-pages.json).

| App | Category | Difficulty | Time | Link |
|---|---|---|---|---|
| Calendly | OAuth provider | Easy | 34.7s | `/guides/calendly` |
| Xero | OAuth provider | Hard | 17.7s | `/guides/xero` |
| Linear | OAuth provider | Easy | 14.1s | `/guides/linear` |
| Composio | Integration platform | n/a | 12.5s | `/guides/composio` |
| Postmark | No OAuth | n/a | 5.4s | `/guides/postmark` |
| Notion | Library guide | Easy | not generated | `/guides/notion` |
| Dropbox | OAuth provider | Easy | 18.2s | `/guides/dropbox` |
| Shopify | OAuth provider | Hard (not fully confirmed) | 14.3s, second try | `/guides/shopify` |

Shopify's first try failed with "The agent couldn't produce a valid guide." Retrying worked with no change.

## Consistency

The difficulty rule changed during testing, so an older rating for an app can differ for that reason alone. Results marked "before fixes" came from earlier code.

| App | Finished runs | Category | Difficulty |
|---|---|---|---|
| Composio | 11 | Integration platform, 11 of 11 | n/a |
| Postmark | 11 | No OAuth, 11 of 11 | n/a |
| Calendly | 16 | OAuth provider, 16 of 16 | Easy 15 of 16; one Unknown before fixes |
| Xero | 7 | OAuth provider, 7 of 7 | **Not stable:** Unknown 4, Moderate 2, Hard 1 |
| GitHub | 5 | OAuth provider, 5 of 5 | Changed with the rule; Easy on the final rule |
| Slack | 5 | OAuth provider, 5 of 5 | Changed with the rule; Easy on the final rule, should be Moderate |
| Google | 6 | OAuth provider, 6 of 6 | Changed with the rule; Hard (not fully confirmed) on the final rule |

One more Calendly run stopped at the daily quota, so it isn't counted. GitHub, Slack and Google ran only once each on the final rule, so their stability on it isn't proven.

## Checker totals

| Runs | Claims checked | Kept | Downgraded | Dropped |
|---|---|---|---|---|
| All 38 guide runs with recorded counts | 399 | 353 | 37 | 9 |
| The 4 final-code runs with recorded counts | 44 | 36 | 7 | 1 |

The live warm-cache guides for Calendly, Xero, Linear and Dropbox are not in these totals. Their pages show 8 claims downgraded and none dropped, but not the number kept.

## Typical time

| Result | Median | Fastest | Slowest |
|---|---|---|---|
| Guide (38 runs) | 27.3s | 14.3s | 107.6s |
| Card (20 runs) | 13.4s | 7.3s | 146.7s |

The slowest runs happened while the free tier was overloaded.

## "Unknown" results before the final rule

There were 12 Unknown difficulties in 54 finished results: Google 4, Xero 4, GitHub 2, Slack 1, Calendly 1.

| Cause | Count |
|---|---|
| A real quote was found on the page, but the checker said "partly" or "no" | 10 |
| The model gave no gate at all | 1 |
| The page had no OAuth terms, so its quote was thrown out | 1 |

The word-for-word quote rule caused none of these. The final rule shows the "partly" cases as a best estimate labelled "not fully confirmed".

## Free-tier limits hit

- Per-minute 429 errors.
- "High demand" 503 errors on `gemini-3.5-flash-lite`, `gemini-3.5-flash` and `gemini-3.6-flash`.
- Calls that stalled for 60 seconds on `gemini-3.5-flash-lite` and `gemini-3.8-flash`. Two Calendly runs hit the 270-second limit this way.
- The daily quota, during testing with the first key. The final runs used new keys and hit no limits.
